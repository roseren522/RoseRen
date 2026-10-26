"""Build only entries whose literal occurrence can be located in inspected documents."""
import re, json, html, hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
BASE=Path('/tmp/roseren-sources/cmaq/DOCS/Users_Guide')
REV='93099d8159f50e525120c790df674fe837a57edf'
chapters=[('cmaq-6','CMAQ_UG_ch06_model_configuration_options.md','6. Model Configuration Options'),('cmaq-4','CMAQ_UG_ch04_model_inputs.md','4. Model Input Files'),('cmaq-9','CMAQ_UG_ch09_process_analysis.md','9. Process Analysis and Budget'),('cmaq-10','CMAQ_UG_ch10_HDDM-3D.md','10. Decoupled Direct Method in Three Dimensions'),('cmaq-11','CMAQ_UG_ch11_ISAM.md','11. Integrated Source Apportionment Method'),('cmaq-1','CMAQ_UG_ch01_overview.md','1. Overview')]
TOPICS=['氮的形态与循环','农业与土壤','排放与跨介质过程','清单与系统边界','数据与空间方法','不确定性与研究方法','学术表达']
sources=[]; docs={}
for sid,filename,title in chapters:
 path=BASE/filename;raw=path.read_bytes();text=raw.decode()
 docs[sid]=text
 sources.append(dict(id=sid,title='CMAQ User’s Guide · '+title,organization='US EPA 官方代码库 / CMAS 技术指南',year='2022',url=f'https://github.com/USEPA/CMAQ/blob/{REV}/DOCS/Users_Guide/{filename}',scope='CMAQ 5.4 技术文档：大气化学、排放处理与地表交换。不是农业氮全介质清单指南，不能代替 IPCC、FAO 或完整氮收支方法。',evidence='已检查官方代码库中的章节全文；指南版权署年 2022。概述页声明：草稿经 CMAS 审阅，尚非 EPA 正式批准出版文件。',revision=REV,sha256=hashlib.sha256(raw).hexdigest(),file=filename))
entries=[];missing=[]
for i,line in enumerate((ROOT/'scripts/vocabulary.tsv').read_text().splitlines()):
 term,meaning,explanation,collocations,example,translation,topic,difficulty,related=line.split('|')
 found=None
 pattern=re.compile(r'(?<!\w)'+re.escape(term)+r'(?!\w)',re.I)
 for sid,doc in docs.items():
  heading='';
  for n,original in enumerate(doc.splitlines(),1):
   if original.startswith('#'): heading=original.lstrip('#').strip()
   if 'references' in heading.lower(): continue
   plain=html.unescape(re.sub('<[^>]+>','',original)).replace('\\-','-')
   match=pattern.search(plain)
   if match:
    found=(sid,n,heading,plain[max(0,match.start()-20):min(len(plain),match.end()+30)].strip());break
  if found:break
 if not found:missing.append(term);continue
 sid,n,heading,evidence=found
 abbr={'ammonia':'NH₃','ammonium':'NH₄⁺','nitrate':'NO₃⁻','nitrogen oxides':'NOₓ','Cation Exchange Capacity':'CEC','leaf area index':'LAI','Integrated Process Rate':'IPR','Integrated Reaction Rate':'IRR','source apportionment':'ISAM'}.get(term)
 variants={'emissions inventories':['emissions inventory','emission inventory'],'concentrations':['concentration'],'emissions':['emission'],'croplands':['cropland'],'reaction rates':['reaction rate'],'emission factors':['emission factor'],'emission rates':['emission rate'],'precursors':['precursor'],'in-situ observations':['in situ observations'],'area weighted':['area-weighted'],'second order sensitivity':['second-order sensitivity']}.get(term,[])
 entries.append(dict(id=f'v{i+1:03}',term=term,meaning=meaning,explanation=explanation,pos='phrase' if int(topic)==6 else ('adj.' if term in ['rainfed','irrigated','nonlinear','anthropogenic','aqueous','gas-phase','terrestrial','aquatic'] else 'n. / n. phrase'),abbreviation=abbr,collocations=collocations.split(';'),example=example,translation=translation,topic=TOPICS[int(topic)],difficulty=difficulty,related=related,variants=variants,verification='verified',sourceId=sid,location=f'{heading} · L{n}',evidence=evidence,definitionNote='概念依据：同一 CMAQ 章节中的技术描述；中文解释和例句为本站原创释义，不是文献引文。'))
(ROOT/'src/data/vocabulary.json').write_text(json.dumps(entries,ensure_ascii=False,indent=2)+'\n')
(ROOT/'src/data/sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
print(f'Verified literal occurrences: {len(entries)}. Missing (excluded): {missing}')

# Preserve the English extension when rebuilding the legacy bilingual collection.
import runpy
runpy.run_path(str(ROOT/"scripts/expand_content.py"), run_name="__main__")
runpy.run_path(str(ROOT/"scripts/build_readings.py"), run_name="__main__")
