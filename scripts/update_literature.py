"""Daily, key-free Europe PMC ingestion. Only explicitly CC BY/CC0 abstracts.

No language model is used: definitions come from the maintained glossary;
questions are contextual gap-fills and a source-evidence self-assessment.
Existing lessons are immutable so saved learning records remain valid.
"""
import argparse
import copy
import hashlib
import json
import os
import random
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src/data/daily-literature.json"
API = "https://www.ebi.ac.uk/europepmc/webservices/rest"
XLINK = "{http://www.w3.org/1999/xlink}href"
LEARNING_TIMEZONE = timezone(timedelta(hours=8))


def literature_day(value):
    """Use the learner's Beijing calendar day for both scheduling and the cap."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError("Literature timestamps must include a timezone")
    return value.astimezone(LEARNING_TIMEZONE).date()


def scheduled_run_needed(config, catalog, now):
    """Later schedules recover missed/failed runs and try to fill today's cap."""
    today = literature_day(now)
    checked = catalog.get("lastCheckedAt")
    if not checked or literature_day(checked) != today:
        return True
    added_today = sum(literature_day(a["addedAt"]) == today for a in catalog["articles"])
    return added_today < config["daily_limit"]


def text(node):
    return " ".join("".join(node.itertext()).split()) if node is not None else ""


def normalized(value):
    return " ".join(value.casefold().split()).rstrip(".")


def stable_id(prefix, value):
    return prefix + hashlib.sha256(normalized(value).encode()).hexdigest()[:20]


def request(url):
    # Fixed API host; publisher URLs and XML external entities are never fetched.
    if not url.startswith(API + "/"):
        raise ValueError("Unexpected literature API URL")
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Fieldnotes-literature/1.0 (github.com/roseren522/RoseRen)",
                "Accept": "application/json, application/xml;q=0.9",
            })
            with urllib.request.urlopen(req, timeout=35) as response:
                body = response.read(12_000_001)
                if len(body) > 12_000_000:
                    raise ValueError("Source exceeds ingestion size limit")
                return body
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
        except urllib.error.URLError:
            if attempt == 2:
                raise
        time.sleep(2 ** attempt)
    raise RuntimeError("Literature request failed")


def search(topic, config, now):
    today = now.date()
    index_start = today - timedelta(days=config["index_lookback_days"])
    publication_start = today - timedelta(days=config["publication_lookback_days"])
    query = (
        f'({topic["query"]}) AND OPEN_ACCESS:Y AND HAS_ABSTRACT:Y AND LANG:eng '
        f'AND FIRST_IDATE:[{index_start} TO {today}] '
        f'AND FIRST_PDATE:[{publication_start} TO {today}] '
        'AND NOT PUB_TYPE:"Preprint" AND NOT PUB_TYPE:"Retracted Publication" '
        'AND NOT PUB_TYPE:"Retraction of Publication" sort_date:y'
    )
    url = API + "/search?" + urllib.parse.urlencode({
        "query": query, "resultType": "core", "format": "json", "pageSize": 60,
    })
    data = json.loads(request(url))
    if "resultList" not in data or not isinstance(data.get("hitCount"), int):
        raise ValueError("Invalid Europe PMC search response")
    return data["resultList"]["result"]


def licensed_abstract(raw, pmcid):
    # JATS can declare an external DTD; ElementTree does not fetch it.
    # Reject entity definitions so source text is always treated as inert data.
    if re.search(br"<!\s*ENTITY", raw, re.I):
        raise ValueError("XML declarations are not supported")
    root = ET.fromstring(raw)
    meta = root.find("./front/article-meta")
    if meta is None or root.get("article-type") not in ("research-article", "review-article"):
        return None
    if root.get("{http://www.w3.org/XML/1998/namespace}lang", "en") not in ("en", "eng"):
        return None
    ids = {e.get("pub-id-type"): text(e) for e in meta.findall("article-id")}
    if ("PMC" + ids.get("pmc", ids.get("pmcid", "")).removeprefix("PMC")) != pmcid:
        return None
    license_url = None
    for license_node in meta.findall("./permissions/license"):
        for element in license_node.iter():
            value = element.get(XLINK, "")
            if re.fullmatch(r"https?://creativecommons\.org/(licenses/by/[1-4]\.0|publicdomain/zero/1\.0)/?", value):
                license_url = value.replace("http://", "https://")
                break
    if not license_url:
        return None
    paragraphs = []
    for abstract in meta.findall("abstract"):
        if abstract.get("abstract-type") in ("graphical", "highlights", "toc"):
            continue
        for p in abstract.iter("p"):
            value = text(p)
            if value and value not in paragraphs:
                paragraphs.append(value)
    words = sum(len(p.split()) for p in paragraphs)
    if not 100 <= words <= 750 or not paragraphs:
        return None
    # Single-paragraph abstracts stay verbatim; do not invent paragraph breaks.
    authors = []
    for name in meta.findall("./contrib-group/contrib[@contrib-type='author']/name"):
        authors.append(" ".join(filter(None, [text(name.find("given-names")), text(name.find("surname"))])))
    title = text(meta.find("./title-group/article-title"))
    if not title or not authors:
        return None
    return {
        "title": title, "paragraphs": paragraphs, "authors": ", ".join(authors),
        "journal": text(root.find("./front/journal-meta/journal-title-group/journal-title")),
        "doi": ids.get("doi", "").lower(), "licenseUrl": license_url,
        "license": "CC0 1.0" if "/zero/" in license_url else "CC BY " + license_url.rstrip("/").split("/")[-1],
        "abstractSha256": hashlib.sha256("\n".join(paragraphs).encode()).hexdigest(),
    }


def glossary():
    result = {}
    for entry in json.loads((ROOT / "src/data/vocabulary.json").read_text()):
        if entry.get("contentLanguage") == "en":
            result[normalized(entry["term"])] = entry["meaning"]
    result.update(json.loads((ROOT / "scripts/literature_terms.json").read_text()))
    return result


def term_matches(paragraphs, definitions):
    matched = []
    for term, definition in definitions.items():
        pattern = re.compile(r"(?<!\w)" + re.escape(term) + r"(?!\w)", re.I)
        for index, paragraph in enumerate(paragraphs):
            hit = pattern.search(paragraph)
            if not hit:
                continue
            # Keep an intact source sentence, including the literal matched term.
            start = max(paragraph.rfind(". ", 0, hit.start()), paragraph.rfind("? ", 0, hit.start()))
            start = start + 2 if start >= 0 else 0
            end = re.search(r"[.!?](?:\s|$)", paragraph[hit.end():])
            end = hit.end() + end.end() if end else len(paragraph)
            sentence = paragraph[start:end].strip()
            if len(sentence) <= 1200:
                matched.append({"term": term, "definition": definition, "paragraph": index + 1, "sentence": sentence})
            break
    # Prefer specific multiword expressions; avoid two nested variants in a lesson.
    selected = []
    for match in sorted(matched, key=lambda m: (-len(m["term"].split()), -len(m["term"]), m["term"])):
        if not any(m["term"] in match["term"] or match["term"] in m["term"] for m in selected):
            selected.append(match)
    return selected


def make_lesson(article, source_id, definitions):
    matches = term_matches(article["paragraphs"], definitions)
    if len(matches) < 2:
        return None
    rng = random.Random(source_id)
    questions = []
    for index, match in enumerate(matches[:2]):
        term = match["term"]
        distractors = [t for t in sorted(definitions) if t != term and
                       not re.search(r"(?<!\w)" + re.escape(t) + r"(?!\w)", match["sentence"], re.I) and
                       normalized(definitions[t]) != normalized(match["definition"])]
        if len(distractors) < 3:
            return None
        options = [term, *rng.sample(distractors, 3)]
        rng.shuffle(options)
        choices = [{
            "id": chr(97 + n), "text": option,
            "explanation": ("The original abstract uses this expression. " if option == term else "This is not the expression used in this sentence. ") + definitions[option],
        } for n, option in enumerate(options)]
        questions.append({
            "id": f"q{index + 1}", "type": "choice", "skill": "Vocabulary in source context",
            "prompt": "Which expression completes the original abstract sentence?\n\n" +
                      re.sub(r"(?<!\w)" + re.escape(term) + r"(?!\w)", "_____", match["sentence"], flags=re.I),
            "paragraphs": [match["paragraph"]], "choices": choices,
            "correct": next(c["id"] for c in choices if c["text"] == term),
            "explanation": "Source expression: " + term + ". " + match["definition"] + " The definition is from the maintained learning glossary; the article supplies the occurrence evidence.",
        })
    questions.append({
        "id": "q3", "type": "short", "skill": "Evidence-based abstract comprehension",
        "prompt": "In 3–5 English sentences, explain the research question and a finding or conclusion actually stated in this abstract. Support your answer with a specific detail. Identify one limitation the abstract states, or one question it leaves unanswered; label your own inference clearly.",
        "paragraphs": list(range(1, len(article["paragraphs"]) + 1)),
        "modelAnswer": "Reference evidence — final abstract paragraph (verbatim):\n\n" + article["paragraphs"][-1] + "\n\nUse the complete abstract to identify the research question and supporting detail. This excerpt is evidence to compare against, not a generated model essay.",
        "rubric": [
            "Describe the research question using information explicitly present in the abstract.",
            "Report a stated finding or conclusion and a specific supporting detail without inventing numbers.",
            "Separate the authors' claims from your own inferences or unanswered questions; do not assume that association proves causation.",
        ],
        "explanation": "Compare your English answer with the abstract and checklist. This is self-assessment; no AI grade or expert review is claimed.",
    })
    return {
        "id": source_id, "version": 1, "title": article["title"],
        "subtitle": "Open-access abstract · " + article["journal"] + " · " + article["publishedAt"],
        "topic": article["topic"], "level": "Advanced", "sourceId": source_id,
        "location": "Publisher abstract distributed through Europe PMC (verbatim text; paragraph labels added).",
        "paragraphs": article["paragraphs"], "terms": [{"term": m["term"], "definition": m["definition"]} for m in matches[:5]],
        "questions": questions, "takeaway": "Use the full article to check methods, uncertainty and limitations before applying an abstract's findings.",
        "evidenceType": "abstract", "publishedAt": article["publishedAt"], "addedAt": article["addedAt"],
    }


def collect(config, catalog, now, search_fn=search, xml_fn=None):
    validate(catalog)
    if (not 1 <= config["daily_limit"] <= 10 or not 1 <= config["vocabulary_per_article"] <= 10 or
        not config["topics"] or not 1 <= config["index_lookback_days"] <= 365 or
        not 1 <= config["publication_lookback_days"] <= 730):
        raise ValueError("Invalid daily content limits")
    timestamp = now.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    today = now.date().isoformat()
    # Automatic retries and manual reruns share one Beijing-calendar-day cap.
    added_today = sum(literature_day(a["addedAt"]) == literature_day(now) for a in catalog["articles"])
    remaining = max(0, config["daily_limit"] - added_today)
    queues = []
    # Search all topics even on capped days so lastCheckedAt means a real check.
    for topic in config["topics"]:
        queues.append((topic, search_fn(topic, config, now)))
    output = copy.deepcopy(catalog)
    seen_pmc = {a["pmcid"] for a in output["articles"]}
    seen_doi = {a["doi"] for a in output["articles"] if a["doi"]}
    seen_title = {normalized(a["title"]) for a in output["articles"]}
    known_terms = {normalized(e["term"]) for e in json.loads((ROOT / "src/data/vocabulary.json").read_text()) + output["vocabulary"]}
    definitions = glossary()
    added = 0
    errors = []
    inspected = set()
    # Rotate the first topic each day to avoid permanently favouring one field.
    shift = now.date().toordinal() % len(queues)
    queues = queues[shift:] + queues[:shift]
    for offset in range(max((len(q) for _, q in queues), default=0)):
        for topic, records in queues:
            if added >= remaining or len(inspected) >= 30:
                break
            if offset >= len(records):
                continue
            record = records[offset]
            pmcid = record.get("pmcid", "")
            doi = record.get("doi", "").strip().lower()
            title = normalized(record.get("title", ""))
            published = record.get("firstPublicationDate", "")
            if (not re.fullmatch(r"PMC\d+", pmcid) or pmcid in inspected or pmcid in seen_pmc or
                (doi and doi in seen_doi) or title in seen_title or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", published) or
                not (now.date() - timedelta(days=config["publication_lookback_days"])).isoformat() <= published <= today or
                record.get("isRetracted", "N") == "Y"):
                continue
            inspected.add(pmcid)
            try:
                raw = xml_fn(pmcid) if xml_fn else request(API + "/" + pmcid + "/fullTextXML")
                article = licensed_abstract(raw, pmcid)
            except urllib.error.HTTPError as error:
                if error.code in (404, 410):
                    continue  # Metadata can appear before the full-text XML.
                errors.append(f"{pmcid}: HTTP {error.code}")
                continue
            except (urllib.error.URLError, ET.ParseError, ValueError) as error:
                errors.append(f"{pmcid}: {type(error).__name__}")
                continue
            if not article or (article["doi"] and article["doi"] in seen_doi) or normalized(article["title"]) in seen_title:
                continue
            if doi and article["doi"] and doi != article["doi"]:
                continue
            article.update({"pmcid": pmcid, "publishedAt": published, "addedAt": timestamp, "topic": topic["name"]})
            source_id = "literature-" + pmcid.lower()
            lesson = make_lesson(article, source_id, definitions)
            if not lesson:
                continue
            article["source"] = {
                "id": source_id, "kind": "article", "title": article["title"], "authors": article["authors"],
                "organization": article["journal"], "year": published[:4],
                "url": f"https://pmc.ncbi.nlm.nih.gov/articles/{pmcid}/",
                "scope": "Abstract only. Full-text methods and claims have not been reviewed by Fieldnotes.",
                "evidence": "Automatically extracted from Europe PMC XML; literal term occurrences and explicit reuse license checked. No independent scientific review.",
                "revision": article["abstractSha256"], "license": article["license"], "licenseUrl": article["licenseUrl"],
                "publishedAt": published, "doi": article["doi"],
            }
            article["lesson"] = lesson
            output["articles"].append(article)
            for match in term_matches(article["paragraphs"], definitions)[:config["vocabulary_per_article"]]:
                term = match["term"]
                if normalized(term) in known_terms:
                    continue
                output["vocabulary"].append({
                    "id": stable_id("lit-term-", term), "term": term, "meaning": match["definition"],
                    "explanation": "Read this expression in the linked abstract. The definition is maintained by Fieldnotes and is not a quotation or an independently reviewed terminology standard.",
                    "pos": "term", "collocations": [], "example": match["sentence"], "exampleKind": "quotation", "translation": "",
                    "topic": "学术表达", "difficulty": "进阶", "related": "", "variants": [], "verification": "verified",
                    "sourceId": source_id, "location": f'Abstract · paragraph {match["paragraph"]}',
                    "evidence": match["sentence"], "definitionNote": "Maintained English learning glossary; the abstract verifies occurrence only.",
                    "contentLanguage": "en",
                })
                known_terms.add(normalized(term))
            seen_pmc.add(pmcid)
            if article["doi"]:
                seen_doi.add(article["doi"])
            seen_title.add(normalized(article["title"]))
            added += 1
        if added >= remaining or len(inspected) >= 30:
            break
    # Never publish a misleading successful check after XML retrieval errors.
    if errors:
        raise RuntimeError("Source retrieval failed; existing content kept: " + "; ".join(errors[:5]))
    output["lastCheckedAt"] = timestamp
    if added:
        output["lastAddedAt"] = timestamp
    output["history"] = [{"checkedAt": timestamp, "added": added, "total": len(output["articles"])}] + output["history"][:29]
    validate(output)
    return output


def validate(catalog):
    if catalog.get("schemaVersion") != 1:
        raise ValueError("Unsupported literature catalog version")
    articles = catalog["articles"]
    for field in ("pmcid", "title"):
        values = [normalized(a[field]) for a in articles]
        if len(set(values)) != len(values):
            raise ValueError("Duplicate article " + field)
    dois = [a["doi"].lower() for a in articles if a["doi"]]
    if len(set(dois)) != len(dois):
        raise ValueError("Duplicate article DOI")
    entries = catalog["vocabulary"]
    if len({e["id"] for e in entries}) != len(entries) or len({normalized(e["term"]) for e in entries}) != len(entries):
        raise ValueError("Duplicate daily vocabulary")
    for article in articles:
        lesson, source = article["lesson"], article["source"]
        if not re.fullmatch(r"https://creativecommons\.org/(licenses/by/[1-4]\.0|publicdomain/zero/1\.0)/?", source["licenseUrl"]):
            raise ValueError("Unsupported reuse license")
        if source["url"] != f'https://pmc.ncbi.nlm.nih.gov/articles/{article["pmcid"]}/':
            raise ValueError("Unexpected source URL")
        if lesson["paragraphs"] != article["paragraphs"] or lesson["sourceId"] != source["id"] or lesson["id"] != source["id"]:
            raise ValueError("Abstract provenance mismatch")
        digest = hashlib.sha256("\n".join(article["paragraphs"]).encode()).hexdigest()
        if digest != article["abstractSha256"] or digest != source["revision"]:
            raise ValueError("Abstract hash mismatch")
        for q in lesson["questions"]:
            if not all(1 <= p <= len(lesson["paragraphs"]) for p in q["paragraphs"]):
                raise ValueError("Invalid evidence paragraph")
            if q["type"] == "choice":
                if len(q["choices"]) != 4 or len({c["text"] for c in q["choices"]}) != 4:
                    raise ValueError("Invalid choice set")
                answers = [c["text"] for c in q["choices"] if c["id"] == q["correct"]]
                if len(answers) != 1 or not any(re.search(r"(?<!\w)" + re.escape(answers[0]) + r"(?!\w)", lesson["paragraphs"][p - 1], re.I) for p in q["paragraphs"]):
                    raise ValueError("Choice lacks source evidence")
    by_source = {a["source"]["id"]: a for a in articles}
    for entry in entries:
        article = by_source[entry["sourceId"]]
        if not any(entry["example"] in p and re.search(r"(?<!\w)" + re.escape(entry["term"]) + r"(?!\w)", entry["example"], re.I) for p in article["paragraphs"]):
            raise ValueError("Vocabulary lacks literal source evidence")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate bundled data without network requests")
    args = parser.parse_args()
    catalog = json.loads(CATALOG.read_text())
    if args.check:
        validate(catalog)
        print(f'Validated {len(catalog["articles"])} daily articles and {len(catalog["vocabulary"])} daily vocabulary entries.')
        return
    config = json.loads((ROOT / "scripts/literature_config.json").read_text())
    updated = collect(config, catalog, datetime.now(timezone.utc))
    temporary = CATALOG.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
    os.replace(temporary, CATALOG)
    print(f'Added {len(updated["articles"]) - len(catalog["articles"])} articles; {len(updated["vocabulary"])} daily vocabulary entries total.')


if __name__ == "__main__":
    main()
