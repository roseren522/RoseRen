"""Recheck pinned official source bytes and each recorded occurrence. No invented DOI."""
import json,hashlib,re,html,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sources=json.loads((root/'src/data/sources.json').read_text())
entries=json.loads((root/'src/data/vocabulary.json').read_text())
docs={}
for source in sources:
 url=source['url'].replace('https://github.com/USEPA/CMAQ/blob/','https://raw.githubusercontent.com/USEPA/CMAQ/')
 raw=urllib.request.urlopen(url,timeout=45).read()
 assert hashlib.sha256(raw).hexdigest()==source['sha256'],f'Hash mismatch: {source["id"]}'
 docs[source['id']]=raw.decode().splitlines()
 print('Verified pinned source:',source['title'])
for entry in entries:
 assert entry['verification']=='verified'
 n=int(entry['location'].rsplit('L',1)[1])
 line=html.unescape(re.sub('<[^>]+>','',docs[entry['sourceId']][n-1])).replace('\\-','-')
 assert re.search(r'(?<!\w)'+re.escape(entry['term'])+r'(?!\w)',line,re.I),entry['term']
 assert entry['evidence'] in line,entry['term']
 assert entry['example'] and entry['translation'] and entry['explanation']
assert len({e['id'] for e in entries})==len(entries)
print(f'PASS: {len(entries)} entries, {len(sources)} pinned official chapters; literal occurrences and locations match.')
