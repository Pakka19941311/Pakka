"""Read licensed original wood geometry, retaining HTTP range receipts.

The 949 MB needle geometry is not needed to restore damaged simplified limbs.
Never represents partial range downloads as a verified complete source binary.
"""
from pathlib import Path
import hashlib,json,urllib.request,struct

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'art/world-final/nature-source/pine-wood';OUT.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'docs/assets/world-source-manifest.json').read_text('utf-8'))
entry=next(x for x in manifest['files'] if x['path']=='pine_tree_01/pine_tree_01_1k.gltf')
target=OUT/'pine_tree_01_1k.gltf'
if not target.exists():
    with urllib.request.urlopen(entry['url'],timeout=40) as response:raw=response.read(100000)
    if hashlib.sha256(raw).hexdigest()!=entry['sha256']:raise RuntimeError('Original glTF differs from saved source receipt')
    target.write_bytes(raw)
doc=json.loads(target.read_text());ranges={}
for mesh in doc['meshes']:
    print(mesh.get('name'),[(doc['materials'][p['material']]['name'],doc['accessors'][p['indices']]['count']//3) for p in mesh['primitives']],flush=True)
    for p in mesh['primitives']:
        if doc['materials'][p['material']]['name']=='pine_tree_01_twig':continue
        for index in [*p['attributes'].values(),p['indices']]:
            a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
            ranges[a['bufferView']]=(v.get('byteOffset',0),v['byteLength'])
print(json.dumps({'views':len(ranges),'total_bytes':sum(v[1] for v in ranges.values())}),flush=True)
binary_entry=next(x for x in manifest['files'] if x['path']=='pine_tree_01/pine_tree_01.bin')
binary_url=binary_entry['url']
receipts=[];data={}
stream_verified=False
for index,(start,length) in ranges.items():
    path=OUT/f'view-{index:03}.bin'
    if path.exists():raw=path.read_bytes();assert len(raw)==length
    else:
        request=urllib.request.Request(binary_url,headers={'Range':f'bytes={start}-{start+length-1}'})
        with urllib.request.urlopen(request,timeout=60) as response:
            if response.status==200:
                # Public CDN does not honor Range: stream once, hash all bytes,
                # retain only the eight MB of wood. Bounded by the source receipt.
                buffers={i:bytearray(n) for i,(_,n) in ranges.items()};position=0;digest=hashlib.sha256()
                while True:
                    chunk=response.read(1024*1024)
                    if not chunk:break
                    digest.update(chunk);end=position+len(chunk)
                    if end>binary_entry['bytes']:raise RuntimeError('Source binary exceeds known size')
                    for i,(offset,size) in ranges.items():
                        lo=max(position,offset);hi=min(end,offset+size)
                        if hi>lo:buffers[i][lo-offset:hi-offset]=chunk[lo-position:hi-position]
                    position=end
                    if position%(64*1024*1024)==0:print(f'verified source stream {position//1048576} MiB',flush=True)
                if position!=binary_entry['bytes'] or digest.hexdigest()!=binary_entry['sha256']:raise RuntimeError('Source binary does not match original receipt')
                for i,content in buffers.items():(OUT/f'view-{i:03}.bin').write_bytes(content)
                stream_verified=True;raw=bytes(buffers[index])
            else:
                if response.status!=206:raise RuntimeError(f'Unexpected status {response.status}')
                if response.headers.get('Content-Range','').split('/')[0]!=f'bytes {start}-{start+length-1}':raise RuntimeError('Unexpected source Content-Range')
                raw=response.read(length+1)
        if len(raw)!=length:raise RuntimeError('Truncated source geometry range')
        path.write_bytes(raw)
    data[index]=raw
    receipts.append({'bufferView':index,'offset':start,'bytes':length,'sha256':hashlib.sha256(raw).hexdigest(),'file':path.name})
    print(f'wood buffer {len(receipts)}/{len(ranges)}',flush=True)
(OUT/'source.json').write_text(json.dumps({'asset':'https://polyhaven.com/a/pine_tree_01','license':'CC0-1.0','license_url':'https://polyhaven.com/license','authors':['Rico Cilliers','Rob Tuytel'],'source_gltf_sha256':entry['sha256'],'binary_url':binary_url,'complete_binary_retained':False,'complete_binary_stream_hash_verified':stream_verified,'expected_binary_sha256':binary_entry['sha256'],'range_receipts':receipts},indent=2)+'\n',encoding='utf-8')
