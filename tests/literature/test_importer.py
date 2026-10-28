"""Offline fixtures exercise the importer; these examples are never published."""
import copy
import importlib.util
import json
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("update_literature", ROOT / "scripts/update_literature.py")
ingest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingest)
NOW = datetime(2026, 10, 27, 1, 0, tzinfo=timezone.utc)


def fixture_xml(pmcid="PMC123", title="An illustrative study", doi="10.1234/example", license="https://creativecommons.org/licenses/by/4.0/"):
    return f'''<?xml version="1.0"?>
    <!DOCTYPE article PUBLIC "-//NLM//DTD JATS//EN" "https://example.invalid/not-fetched.dtd">
    <article article-type="research-article" xml:lang="en" xmlns:xlink="http://www.w3.org/1999/xlink">
      <front><journal-meta><journal-title-group><journal-title>Fixture Journal</journal-title></journal-title-group></journal-meta>
      <article-meta><article-id pub-id-type="pmcid">{pmcid}</article-id><article-id pub-id-type="doi">{doi}</article-id>
      <title-group><article-title>{title}</article-title></title-group>
      <contrib-group><contrib contrib-type="author"><name><surname>Tester</surname><given-names>Alex</given-names></name></contrib></contrib-group>
      <permissions><license><license-p>Licensed under <ext-link xlink:href="{license}">the stated license</ext-link>.</license-p></license></permissions>
      <abstract><sec><title>Background</title><p>Biodiversity and ecosystem services support communities across a range of landscapes. We used remote sensing to examine habitat fragmentation and species richness in a clearly defined study area. The analysis compared observations from multiple locations and periods, using consistent methods to minimise differences in sampling conditions.</p></sec>
      <sec><title>Results</title><p>Species richness differed across the sampled locations. These observations describe the locations studied and do not establish that a single environmental factor caused every observed difference. The study illustrates why spatial resolution and soil moisture should be considered when interpreting observational evidence. Future work could assess whether these patterns apply outside the original sampling area.</p></sec></abstract>
    </article-meta></front></article>'''.encode()


def record(pmcid="PMC123", title="An illustrative study", doi="10.1234/example", date="2026-10-26"):
    return {"pmcid": pmcid, "title": title, "doi": doi, "firstPublicationDate": date, "isRetracted": "N"}


class ImporterTests(unittest.TestCase):
    def setUp(self):
        self.empty = {"schemaVersion": 1, "lastCheckedAt": None, "lastAddedAt": None, "articles": [], "vocabulary": [], "history": []}
        self.config = json.loads((ROOT / "scripts/literature_config.json").read_text())
        self.config["topics"] = [{"name": "Ecology & biodiversity", "query": "biodiversity"}]

    def collect(self, rows=None, raw=None, catalog=None, now=NOW):
        return ingest.collect(self.config, self.empty if catalog is None else catalog, now,
                              lambda *_: [record()] if rows is None else rows,
                              lambda _: fixture_xml() if raw is None else raw)

    def test_explicit_license_and_verbatim_evidence(self):
        data = self.collect()
        self.assertEqual(len(data["articles"]), 1)
        self.assertGreater(len(data["vocabulary"]), 0)
        article = data["articles"][0]
        self.assertEqual(article["authors"], "Alex Tester")
        self.assertEqual(article["source"]["license"], "CC BY 4.0")
        self.assertEqual(article["lesson"]["evidenceType"], "abstract")
        self.assertEqual(article["lesson"]["paragraphs"], article["paragraphs"])
        self.assertEqual([q["type"] for q in article["lesson"]["questions"]], ["choice", "choice", "short"])
        for entry in data["vocabulary"]:
            self.assertEqual(entry["example"], entry["evidence"])
            self.assertEqual(entry["exampleKind"], "quotation")
            self.assertIn(entry["term"], entry["example"].lower())
        ingest.validate(data)

    def test_no_duplicate_pmc_doi_title_or_vocabulary_on_repeated_runs(self):
        first = self.collect()
        second = self.collect(catalog=first, now=NOW + timedelta(hours=1))
        self.assertEqual(first["articles"], second["articles"])
        self.assertEqual(first["vocabulary"], second["vocabulary"])
        self.assertEqual(second["history"][0]["added"], 0)
        variants = [record("PMC456", doi="10.1234/example"), record("PMC789", doi="10.1234/different")]
        third = self.collect(rows=variants, catalog=second)
        self.assertEqual(len(third["articles"]), 1)

    def test_non_reusable_licenses_are_skipped(self):
        for license in ["", "https://creativecommons.org/licenses/by-nc/4.0/", "https://example.org/cc-by", "https://creativecommons.org/licenses/by-nd/4.0/"]:
            with self.subTest(license=license):
                self.assertEqual(self.collect(raw=fixture_xml(license=license))["articles"], [])
        self.assertEqual(self.collect(raw=fixture_xml(license="https://creativecommons.org/publicdomain/zero/1.0/"))["articles"][0]["license"], "CC0 1.0")

    def test_future_old_retracted_or_missing_pmc_records_are_skipped(self):
        rows = [record(date="2026-12-01"), record(date="2023-01-01"), record(pmcid=""), {**record(), "isRetracted": "Y"}]
        self.assertEqual(self.collect(rows=rows)["articles"], [])

    def test_mismatched_identifiers_and_insufficient_abstracts_are_skipped(self):
        for raw in [fixture_xml(pmcid="PMC999"), fixture_xml(doi="10.5555/other"), fixture_xml().replace(b"<abstract>", b"<not-abstract>").replace(b"</abstract>", b"</not-abstract>")]:
            self.assertEqual(self.collect(raw=raw)["articles"], [])

    def test_source_failure_preserves_original_catalog(self):
        before = copy.deepcopy(self.empty)
        def fail(_):
            raise urllib.error.URLError("fixture outage")
        with self.assertRaisesRegex(RuntimeError, "existing content kept"):
            ingest.collect(self.config, self.empty, NOW, lambda *_: [record()], fail)
        self.assertEqual(self.empty, before)
        with self.assertRaises(urllib.error.URLError):
            ingest.collect(self.config, self.empty, NOW, lambda *_: fail(None), fail)
        self.assertEqual(self.empty, before)

    def test_daily_cap_applies_across_manual_reruns_and_keeps_old_lesson(self):
        self.config["daily_limit"] = 1
        first = self.collect()
        rows = [record("PMC456", "Another illustrative study", "10.1234/second")]
        second = self.collect(rows=rows, raw=fixture_xml("PMC456", "Another illustrative study", "10.1234/second"), catalog=first)
        self.assertEqual(len(second["articles"]), 1)
        next_day = self.collect(rows=rows, raw=fixture_xml("PMC456", "Another illustrative study", "10.1234/second"), catalog=second, now=NOW + timedelta(days=1))
        self.assertEqual(len(next_day["articles"]), 2)
        self.assertEqual(next_day["articles"][0], first["articles"][0])
        self.assertEqual(len(next_day["vocabulary"]), len(first["vocabulary"]))

    def test_catch_up_schedules_run_until_success_and_daily_cap(self):
        self.config["daily_limit"] = 1
        self.assertTrue(ingest.scheduled_run_needed(self.config, self.empty, NOW))
        # A genuine zero-result search still permits later indexing to be checked.
        no_results = self.collect(rows=[])
        self.assertTrue(ingest.scheduled_run_needed(self.config, no_results, NOW + timedelta(hours=4)))
        complete = self.collect()
        self.assertFalse(ingest.scheduled_run_needed(self.config, complete, NOW + timedelta(hours=4)))
        self.assertTrue(ingest.scheduled_run_needed(self.config, complete, NOW + timedelta(days=1)))
        # A failed new-day attempt leaves the old timestamp, allowing catch-up.
        before = copy.deepcopy(complete)
        def fail(*_):
            raise urllib.error.URLError("fixture outage")
        with self.assertRaises(urllib.error.URLError):
            ingest.collect(self.config, complete, NOW + timedelta(days=1), fail, fail)
        self.assertEqual(complete, before)
        self.assertTrue(ingest.scheduled_run_needed(self.config, complete, NOW + timedelta(days=1, hours=4)))

    def test_daily_cap_and_schedule_share_beijing_midnight(self):
        self.config["daily_limit"] = 1
        # 23:30 Beijing, then 00:30 Beijing on the same UTC date.
        first_at = datetime(2026, 10, 27, 15, 30, tzinfo=timezone.utc)
        midnight_at = first_at + timedelta(hours=1)
        first = self.collect(now=first_at)
        self.assertTrue(ingest.scheduled_run_needed(self.config, first, midnight_at))
        rows = [record("PMC456", "Another illustrative study", "10.1234/second")]
        second = self.collect(rows=rows, raw=fixture_xml("PMC456", "Another illustrative study", "10.1234/second"), catalog=first, now=midnight_at)
        self.assertEqual(len(second["articles"]), 2)
        self.assertEqual(first["articles"][0], second["articles"][0])
        # UTC midnight during that same Beijing day must not reset the cap.
        after_utc_midnight = datetime(2026, 10, 28, 0, 30, tzinfo=timezone.utc)
        self.assertFalse(ingest.scheduled_run_needed(self.config, second, after_utc_midnight))
        rows = [record("PMC789", "A third illustrative study", "10.1234/third")]
        third = self.collect(rows=rows, raw=fixture_xml("PMC789", "A third illustrative study", "10.1234/third"), catalog=second, now=after_utc_midnight)
        self.assertEqual(len(third["articles"]), 2)
        self.assertEqual(third["history"][0]["added"], 0)

    def test_deterministic_questions_and_tampered_evidence_rejected(self):
        first, second = self.collect(), self.collect()
        self.assertEqual(first, second)
        bad = copy.deepcopy(first)
        bad["articles"][0]["paragraphs"][0] = "Fabricated replacement"
        with self.assertRaises(ValueError):
            ingest.validate(bad)
        bad = copy.deepcopy(first)
        bad["vocabulary"][0]["example"] = "Invented quotation"
        with self.assertRaisesRegex(ValueError, "literal source"):
            ingest.validate(bad)

    def test_entity_definitions_are_rejected_without_fetching(self):
        with self.assertRaises(ValueError):
            ingest.licensed_abstract(b'<!DOCTYPE article [<!ENTITY x SYSTEM "file:///etc/passwd">]><article/>', "PMC123")

    def test_api_query_covers_late_indexing_and_fixed_host(self):
        calls = []
        original = ingest.request
        try:
            ingest.request = lambda url: calls.append(url) or b'{"hitCount":0,"resultList":{"result":[]}}'
            ingest.search(self.config["topics"][0], self.config, NOW)
        finally:
            ingest.request = original
        from urllib.parse import parse_qs, urlparse
        query = parse_qs(urlparse(calls[0]).query)["query"][0]
        self.assertIn("FIRST_IDATE:[2026-09-27 TO 2026-10-27]", query)
        self.assertIn("FIRST_PDATE:[2025-10-27 TO 2026-10-27]", query)
        self.assertIn("LANG:eng", query)
        with self.assertRaisesRegex(ValueError, "Unexpected"):
            original("https://example.invalid/untrusted")


if __name__ == "__main__":
    unittest.main()
