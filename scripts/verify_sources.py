"""Check official source bytes, literal vocabulary occurrences and reading locators."""
import json,hashlib,re,html,urllib.request,subprocess,tempfile,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sources=json.loads((root/'src/data/sources.json').read_text())
entries=json.loads((root/'src/data/vocabulary.json').read_text())
lessons=json.loads((root/'src/data/readings.json').read_text())
def inspect(source):
 url=source['url'].replace('https://github.com/USEPA/CMAQ/blob/','https://raw.githubusercontent.com/USEPA/CMAQ/')
 raw=urllib.request.urlopen(url,timeout=45).read()
 assert hashlib.sha256(raw).hexdigest()==source['sha256'],f'Hash mismatch: {source["id"]}'
 if source.get('format')=='pdf':
  with tempfile.TemporaryDirectory(prefix='fieldnotes-source-') as folder:
   pdf=Path(folder)/'source.pdf';txt=Path(folder)/'source.txt';pdf.write_bytes(raw)
   subprocess.run(['pdftotext','-layout',str(pdf),str(txt)],check=True)
   units=txt.read_text().split('\f')
 else:units=raw.decode().splitlines()
 return source['id'],units
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 docs=dict(pool.map(inspect,sources))
for source in sources:print('Verified source:',source['title'],flush=True)
for entry in entries:
 assert entry['verification']=='verified'
 if entry.get('sourceAnchor','').startswith('#page='):
  n=int(entry['sourceAnchor'].split('=')[-1]);line=' '.join(docs[entry['sourceId']][n-1].split())
 else:
  n=int(entry['location'].rsplit('L',1)[1]);line=html.unescape(re.sub('<[^>]+>','',docs[entry['sourceId']][n-1])).replace('\\-','-')
 assert re.search(r'(?<!\w)'+re.escape(entry['term'])+r'(?!\w)',line,re.I),entry['term']
 assert entry['evidence'] in line,entry['term']
 assert entry['example'] and entry['explanation'] and (entry['translation'] or entry.get('contentLanguage')=='en')
for lesson in lessons:
 evidence=lesson['sourceEvidence'];body=docs[lesson['sourceId']][evidence['position']-1]
 assert evidence['needle'].lower() in ' '.join(body.split()).lower(),lesson['id']
 assert lesson['evidenceType']=='adaptation'
 assert len(lesson['questions'])==3
assert len({e['id'] for e in entries})==len(entries)
print(f'PASS: {len(entries)} vocabulary occurrences and {len(lessons)} reading source locators verified across {len(sources)} official chapters.')
