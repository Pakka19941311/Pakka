"""Prepare existing licensed prototypes and a persisted forest sample for D.
The runtime consumes saved placements; it never generates them on game startup.
"""
from pathlib import Path
import hashlib,json,math,struct
import numpy as np
from PIL import Image
from build_geography import polygon_field,sample_grid,segment_field

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
OUT.mkdir(parents=True,exist_ok=True);(OUT/'assets').mkdir(exist_ok=True)
PLACEMENTS=OUT/'sample-D01.json'
if PLACEMENTS.exists():raise RuntimeError('Preserve authored placements; version or edit the existing file')
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
height=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
rng=np.random.default_rng(724921);catalog={}

def bundle(group,variant,lod):
    asset=f'{group}_{variant}_lod{lod}';path=ROOT/f'public/assets/world/{group}/{asset}.glb'
    raw=path.read_bytes();length,kind=struct.unpack_from('<II',raw,12);doc=json.loads(raw[20:20+length])
    offset=20+length;blen,bkind=struct.unpack_from('<II',raw,offset);binary=bytearray(raw[offset+8:offset+8+blen])
    assert bkind==0x004e4942 and len(doc['buffers'])==1
    for image in doc.get('images',[]):
        if 'uri' not in image:continue
        uri=image.pop('uri');data=(path.parent/uri).read_bytes()
        while len(binary)%4:binary.append(0)
        image['bufferView']=len(doc['bufferViews']);doc['bufferViews'].append({'buffer':0,'byteOffset':len(binary),'byteLength':len(data)})
        binary.extend(data);image['mimeType']='image/png' if data.startswith(b'\x89PNG') else 'image/jpeg'
    while len(binary)%4:binary.append(0)
    doc['buffers'][0]['byteLength']=len(binary)
    encoded=json.dumps(doc,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
    result=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
    target=OUT/'assets'/(asset+'.glb');target.write_bytes(result)
    attributes=[doc['accessors'][p['attributes']['POSITION']] for m in doc['meshes'] for p in m['primitives']]
    lo=np.min([a['min'] for a in attributes],axis=0);hi=np.max([a['max'] for a in attributes],axis=0)
    triangles=sum(doc['accessors'][p['indices']]['count']//3 for m in doc['meshes'] for p in m['primitives'])
    return {'path':target.relative_to(OUT).as_posix(),'source':path.relative_to(ROOT).as_posix(),'source_sha256':hashlib.sha256(raw).hexdigest(),'sha256':hashlib.sha256(result).hexdigest(),'low':lo.tolist(),'high':hi.tolist(),'triangles':triangles}

for group,variants in [('pine_tree_01',3),('fern_02',4),('shrub_04',1),('rock_moss_set_01',6)]:
    for variant in range(variants):
        key=f'{group}_{variant}';lods=[bundle(group,variant,lod) for lod in [0,1]]
        catalog[key]={'group':group,'lods':lods,'source_license':'CC0-1.0','source_receipt':'docs/assets/world-source-manifest.json'}

bounds=[-730,-145,-560,25];xmin,zmin,xmax,zmax=bounds
roads=layout['roads']
def road_distance(x,z):
    best=np.full(np.asarray(x).shape,1e6,dtype=float)
    for road in roads:
        dist,_=segment_field(np.asarray(x),np.asarray(z),road['points_xyz'])
        best=np.minimum(best,dist-float(road['width'])/2)
    return best
def clearing(x,z):
    return any(float(polygon_field(np.asarray(x),np.asarray(z),m['polygon']))<0 for m in layout['masks'] if m['kind']=='clearing')
placements=[];tree_bins={};tree_points=[]
def add(kind,key,x,z,scale,yaw):
    model=catalog[key]['lods'][0];low=float(model['low'][1]);ground=float(sample_grid(height,x,z))
    identifier=f'D01_{kind}_{sum(p["kind"]==kind for p in placements):05}'
    p={'id':identifier,'kind':kind,'asset':key,'position':[round(x,4),round(ground-low*scale-.055,4),round(z,4)],'ground':round(ground,4),'scale':round(scale,5),'yaw':round(yaw,6)}
    placements.append(p);return p
for attempt in range(25000):
    x=float(rng.uniform(xmin+3,xmax-3));z=float(rng.uniform(zmin+3,zmax-3))
    if float(road_distance(x,z))<1.1 or clearing(x,z):continue
    # Different local densities, bounded minimum trunk separation, no grid.
    field=.70+.20*math.sin(x*.04)*math.cos(z*.027)
    if rng.random()>field:continue
    cell=(math.floor(x/4),math.floor(z/4));near=[]
    for dx in [-1,0,1]:
        for dz in [-1,0,1]:near.extend(tree_bins.get((cell[0]+dx,cell[1]+dz),[]))
    if any((x-a)**2+(z-b)**2<3.8**2 for a,b in near):continue
    variant=int(rng.integers(0,3));scale=float(rng.uniform(.90,1.36))
    p=add('tree',f'pine_tree_01_{variant}',x,z,scale,float(rng.uniform(-math.pi,math.pi)))
    radius=max(catalog[p['asset']]['lods'][0]['high'][0]-catalog[p['asset']]['lods'][0]['low'][0],catalog[p['asset']]['lods'][0]['high'][2]-catalog[p['asset']]['lods'][0]['low'][2])*.46*scale
    tree_points.append([x,z,radius]);tree_bins.setdefault(cell,[]).append((x,z))
    if len(tree_points)>=920:break

for kind,count,margin in [('fern',1400,.25),('shrub',135,.9),('rock',105,1.0)]:
    for attempt in range(count*12):
        x=float(rng.uniform(xmin+2,xmax-2));z=float(rng.uniform(zmin+2,zmax-2))
        if float(road_distance(x,z))<margin:continue
        if kind=='fern':key=f'fern_02_{int(rng.integers(0,4))}';scale=float(rng.uniform(.45,1.15))
        elif kind=='shrub':key='shrub_04_0';scale=float(rng.uniform(.6,1.15))
        else:key=f'rock_moss_set_01_{int(rng.integers(0,6))}';scale=float(rng.uniform(.5,1.5))
        add(kind,key,x,z,scale,float(rng.uniform(-math.pi,math.pi)))
        if sum(p['kind']==kind for p in placements)>=count:break

# A proxy informs placement; actual alpha-aware overhead coverage is checked in Godot.
xs,zs=np.meshgrid(np.arange(xmin+.5,xmax,1),np.arange(zmin+.5,zmax,1));covered=np.zeros(xs.shape,bool)
for x,z,radius in tree_points:covered|=(xs-x)**2+(zs-z)**2<radius**2
eligible=road_distance(xs,zs)>1.1
for mask in layout['masks']:
    if mask['kind']=='clearing':eligible&=polygon_field(xs,zs,mask['polygon'])>=0
proxy=float(np.mean(covered[eligible]));Image.fromarray(np.uint8(eligible)*255).save(OUT/'sample-canopy-eligible.png')
data={'revision':'D01','scope':'170m forest sample, not the finished world','bounds_xz':bounds,'seed':724921,'catalog':catalog,'placements':placements,'counts':{kind:sum(p['kind']==kind for p in placements) for kind in ['tree','fern','shrub','rock']},'canopy_proxy':proxy,'canopy_proxy_method':'1m samples of measured crown extent circles; actual alpha-aware render still required','canopy_actual_verified':False,'full_world':False}
PLACEMENTS.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'saved':str(PLACEMENTS),'counts':data['counts'],'canopy_proxy':proxy}),flush=True)
