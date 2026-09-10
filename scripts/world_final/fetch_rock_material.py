"""Acquire only the reviewed CC0 natural rock surface, retaining source receipts."""
from pathlib import Path
import urllib.request,hashlib,json,datetime
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/world-final/materials/rock_wall_02'
OUT.mkdir(parents=True,exist_ok=True)
receipt_path=OUT/'source.json'
if receipt_path.exists():
    data=json.loads(receipt_path.read_text('utf-8'))
    for e in data['files']:assert hashlib.sha256((ROOT/e['path']).read_bytes()).hexdigest()==e['sha256']
    print('Existing reviewed material verified')
else:
    files=[]
    for kind in ['diff','nor_gl','rough']:
        filename=f'rock_wall_02_{kind}_1k.jpg'
        url='https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_wall_02/'+filename
        request=urllib.request.Request(url,headers={'User-Agent':'Varendor asset pipeline / commercially usable CC0 material'})
        with urllib.request.urlopen(request,timeout=40) as response:
            content=response.read();assert content[:2]==b'\xff\xd8',response.headers
        path=OUT/filename
        if path.exists():assert path.read_bytes()==content,'Preserve changed local source texture'
        else:path.write_bytes(content)
        files.append({'url':url,'path':path.relative_to(ROOT).as_posix(),'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
    receipt={'asset':'Rock Wall 02','author':'Rob Tuytel','publisher':'Poly Haven','asset_url':'https://polyhaven.com/a/rock_wall_02','license':'CC0-1.0','license_url':'https://polyhaven.com/license','source_physical_width_m':2,'downloaded_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':files}
    receipt_path.write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'downloaded':len(files),'bytes':sum(f['bytes'] for f in files)}))
