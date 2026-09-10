"""Acquire the selected CC0 snow material, with provider size/hash checks."""
from pathlib import Path
import urllib.request,json,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'art/world-final/materials/snow_02';OUT.mkdir(parents=True,exist_ok=True)
def read(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Varendor asset preparation (manual project use)'})
    with urllib.request.urlopen(request,timeout=30) as response:return response.read()
metadata=json.loads(read('https://api.polyhaven.com/files/snow_02'))
records=[]
for key in ['Diffuse','nor_gl','Rough']:
    entry=metadata[key]['1k']['jpg'];name=entry['url'].rsplit('/',1)[-1];target=OUT/name
    blob=target.read_bytes() if target.exists() else read(entry['url'])
    assert len(blob)==entry['size'] and hashlib.md5(blob).hexdigest()==entry['md5'],name
    if not target.exists():target.write_bytes(blob)
    records.append({'path':target.relative_to(ROOT).as_posix(),'url':entry['url'],'bytes':len(blob),'provider_md5':entry['md5'],'sha256':hashlib.sha256(blob).hexdigest()})
(OUT/'source.json').write_text(json.dumps({'asset':'snow_02','author':'Rob Tuytel','license':'CC0-1.0','asset_url':'https://polyhaven.com/a/snow_02','license_url':'https://polyhaven.com/license','real_width_m':2,'files':records,'integrated':False},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'files':len(records),'bytes':sum(r['bytes'] for r in records),'path':str(OUT)}))
