"""Add explicitly sourced English vocabulary without changing legacy entry IDs."""
import json,re,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BASE=Path('/tmp/roseren-sources')
TOPICS=['氮的形态与循环','农业与土壤','排放与跨介质过程','清单与系统边界','数据与空间方法','不确定性与研究方法','学术表达']
metadata=[
 ('ipcc-uncertainty','uncertainties','1_Volume1/V1_3_Ch3_Uncertainties.pdf','Volume 1, Chapter 3: Uncertainties','Christopher Frey, Jim Penman, Lisa Hanle, Suvi Monni and Stephen Ogle',5,'Greenhouse-gas inventory uncertainty, probability models, error propagation and Monte Carlo methods.'),
 ('ipcc-data','data-collection','1_Volume1/V1_2_Ch2_DataCollection.pdf','Volume 1, Chapter 2: Approaches to Data Collection','Justin Goodwin, Mike Woodfield, Mirghani Ibnoaf, Matthias Koch and Hong Yan',3,'Data collection for greenhouse-gas inventories: activity data, emission factors, representativeness and documentation.'),
 ('ipcc-energy','combustion','2_Volume2/V2_2_Ch2_Stationary_Combustion.pdf','Volume 2, Chapter 2: Stationary Combustion','Darío R. Gómez, John D. Watterson and co-authors',5,'Stationary-combustion greenhouse gases (CO₂, CH₄ and N₂O); not a comprehensive method for NOₓ or all air pollutants.'),
 ('ipcc-soils','soils','4_Volume4/V4_11_Ch11_N2O&CO2.pdf','Volume 4, Chapter 11: N₂O Emissions from Managed Soils, and CO₂ Emissions from Lime and Urea Application','Cecile De Klein, Rafael S. A. Novoa, Stephen Ogle, Keith A. Smith and co-authors',4,'Direct and indirect soil N₂O and CO₂ from lime/urea application; not a complete cross-media nitrogen budget.'),
]
sources=json.loads((ROOT/'src/data/sources.json').read_text());sources=[s for s in sources if s['id'] not in [m[0] for m in metadata]+['cmaq-8']]
docs={}
for sid,name,path,title,authors,skip,scope in metadata:
 raw=(BASE/(name+'.pdf')).read_bytes();pages=(BASE/(name+'.txt')).read_text().split('\f');docs[sid]=(pages,skip)
 sources.append(dict(id=sid,title='2006 IPCC Guidelines · '+title,organization='IPCC / National Greenhouse Gas Inventories Programme',year='2006',authors=authors,url='https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/'+path,scope=scope,evidence='Official chapter PDF inspected, including its title and author pages. Original English learning explanations and examples are not quotations.',revision=hashlib.sha256(raw).hexdigest(),sha256=hashlib.sha256(raw).hexdigest(),format='pdf',file=name+'.pdf'))
path=BASE/'cmaq/DOCS/Users_Guide/CMAQ_UG_ch08_analysis_tools.md';raw=path.read_bytes();docs['cmaq-8']=(raw.decode().splitlines(),0)
sources.append(dict(id='cmaq-8',title='CMAQ User’s Guide · 8. Analysis Tools for CMAQ output',organization='US EPA official repository / CMAS technical guidance',year='2022',url='https://github.com/USEPA/CMAQ/blob/93099d8159f50e525120c790df674fe837a57edf/DOCS/Users_Guide/CMAQ_UG_ch08_analysis_tools.md',scope='Model evaluation, observation pairing, temporal aggregation and visual analysis. The guide carries the CMAS-reviewed draft disclaimer.',evidence='Pinned official chapter inspected; guide copyright year 2022.',revision='93099d8159f50e525120c790df674fe837a57edf',sha256=hashlib.sha256(raw).hexdigest(),file=path.name,format='markdown'))
entries=json.loads((ROOT/'src/data/vocabulary.json').read_text());entries=[e for e in entries if not e['id'].startswith('en-')]
missing=[]
for i,line in enumerate((ROOT/'scripts/additional_vocabulary.tsv').read_text().splitlines(),1):
 term,meaning,explanation,collocations,example,topic,difficulty,related,sid=line.split('|')
 pages,skip=docs[sid];pattern=re.compile(r'(?<!\w)'+re.escape(term)+r'(?!\w)',re.I);found=None
 for n,body in enumerate(pages[skip:],skip+1):
  plain=' '.join(body.split())
  match=pattern.search(plain)
  if match:found=(n,match.group());break
 if not found:missing.append((term,sid));continue
 n,evidence=found
 anchor=('#page='+str(n)) if sid.startswith('ipcc-') else ('#L'+str(n))
 entries.append(dict(id=f'en-{i:03}',term=term,meaning=meaning,explanation=explanation,pos='n. / phrase',collocations=collocations.split(';'),example=example,translation='',topic=TOPICS[int(topic)],difficulty=difficulty,related=related,variants=[],verification='verified',sourceId=sid,sourceAnchor=anchor,location=f'PDF page {n}' if sid.startswith('ipcc-') else f'Chapter 8 · L{n}',evidence=evidence,definitionNote='Original learning explanation based on this chapter, not a quotation or an independently reviewed terminology standard.',contentLanguage='en'))
(ROOT/'src/data/vocabulary.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
(ROOT/'src/data/sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
print('Total:',len(entries),'New English entries:',sum(e['id'].startswith('en-') for e in entries),'Missing:',missing)
