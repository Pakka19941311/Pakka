"""Persist all forest placements against the approved geography.

The original 170 m sample and its stable IDs are copied unchanged. This tool
refuses to regenerate an authored revision. Runtime loads the saved data.
"""
from pathlib import Path
import json, math, hashlib, collections
import numpy as np
from PIL import Image
from build_geography import polygon_field, segment_field, sample_grid

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
DEST=OUT/'placements-D08.json'
if DEST.exists():raise RuntimeError('Do not regenerate saved placements; edit/version them')
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text())
sample=json.loads((OUT/'authored-D03.json').read_text());families=json.loads((OUT/'families-D08A.json').read_text())
height=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
hz,hx=np.gradient(height,2,2);slope=np.hypot(hx,hz)
catalog={**sample['catalog'],**families['catalog']}
profiles={**json.loads((ROOT/'docs/world-final/nature-D02.json').read_text())['trunk_profiles'],**families['trunk_profiles']}
obstacles=json.loads((ROOT/'godot-pc/world-final/geography/collision.json').read_text())['obstacles']
rng=np.random.default_rng(202609108);placements=list(sample['placements']);counters=collections.Counter();bins={}
for p in placements:
    if p['kind']=='tree':bins.setdefault((int(math.floor(p['position'][0]/8)),int(math.floor(p['position'][2]/8))),[]).append((p['position'][0],p['position'][2],3.8))

def road_distance(x,z):
    best=np.full(np.asarray(x).shape,1e6)
    for road in layout['roads']:
        distance,_=segment_field(x,z,road['points_xyz']);best=np.minimum(best,distance-float(road['width'])/2)
    return best

def valid_area(x,z,margin=0):
    good=(x>-793)&(x<793)&(z>-693)&(z<693)&(sample_grid(slope,x,z)<.64)
    good&=polygon_field(x,z,layout['water']['lake']['polygon'])>margin+3
    # Existing measured architecture, including its actual rotated bounds.
    for obj in obstacles:
        if not obj.get('blocksMovement'):continue
        dx=x-float(obj['x']);dz=-z-float(obj['z'])
        if obj['kind']=='circle':good&=dx*dx+dz*dz>(float(obj['radius'])+margin+2)**2
        else:
            angle=float(obj.get('rotation',0));a=dx*math.cos(angle)+dz*math.sin(angle);b=-dx*math.sin(angle)+dz*math.cos(angle)
            good&=(np.abs(a)>float(obj['halfX'])+margin+2)|(np.abs(b)>float(obj['halfZ'])+margin+2)
    return good

def add(kind,key,x,z,scale,yaw,zone):
    counters[kind]+=1;model=catalog[key]['lods'][0];ground=float(sample_grid(height,x,z))
    p={'id':f'D08_{kind}_{counters[kind]:06}','kind':kind,'asset':key,'position':[round(x,4),round(ground-float(model['low'][1])*scale-.055,4),round(z,4)],'ground':round(ground,4),'scale':round(scale,5),'yaw':round(yaw,6),'biome':zone}
    placements.append(p);return p

zones=[dict(m) for m in layout['masks'] if m['kind'] in ('forest','dead_forest')]
snow=next(l for l in layout['locations'] if l['id']=='L04')
zones.append({'id':'snow_treeline','kind':'snow_transition','polygon':snow['outline_xz']})
zones.append({'id':'swamp_deadwood','kind':'swamp','polygon':layout['water']['swamp']['polygon']})
zone_results=[]
for zone in zones:
    poly=np.array(zone['polygon']);lo=poly.min(axis=0);hi=poly.max(axis=0)
    area=abs(np.dot(poly[:,0],np.roll(poly[:,1],1))-np.dot(poly[:,1],np.roll(poly[:,0],1)))*.5
    count=int(area*.55);x=rng.uniform(lo[0],hi[0],count);z=rng.uniform(lo[1],hi[1],count)
    boundary=polygon_field(x,z,zone['polygon']);road=road_distance(x,z);h=sample_grid(height,x,z)
    good=(boundary<0)&valid_area(x,z,.75)&(road>3.8)
    # The accepted sample keeps every placement exactly as authored.
    good&=~((x>-734)&(x<-556)&(z>-149)&(z<29))
    for clearing in layout['masks']:
        if clearing['kind']=='clearing':good&=polygon_field(x,z,clearing['polygon'])>3
    if zone['kind']=='snow_transition':good&=(h<243)&(h>110)
    if zone['kind']=='swamp':good&=(h>12.6)&(h<26)
    first=len(placements);retained=[]
    for i in np.flatnonzero(good):
        px=float(x[i]);pz=float(z[i]);edge=float(-boundary[i]);variation=math.sin(px*.036)*math.cos(pz*.027)
        spacing=3.8 if variation>.1 and zone['id']=='living_forest' else 5.1
        if edge<18:spacing=7.4
        if zone['kind']=='dead_forest':spacing=6.6
        if zone['kind']=='swamp':spacing=12.5
        if zone['kind']=='snow_transition':spacing=5.8+max(0,float(h[i])-155)*.12
        cell=(math.floor(px/8),math.floor(pz/8));near=[]
        reach=math.ceil(spacing/8)+1
        for dx in range(-reach,reach+1):
            for dz in range(-reach,reach+1):near.extend(bins.get((cell[0]+dx,cell[1]+dz),[]))
        if any((px-a)**2+(pz-b)**2<max(spacing,s)**2 for a,b,s in near):continue
        roll=rng.random()
        if zone['kind'] in ('dead_forest','swamp'):key=f'dead_pine_{int(rng.integers(3))}';scale=float(rng.uniform(.67,1.12))
        elif roll<.07 and zone['kind']!='snow_transition':key=f'alder_understorey_{int(rng.integers(2))}';scale=float(rng.uniform(.8,1.25))
        else:
            key=f'pine_tree_01_{int(rng.integers(3))}';scale=float(rng.uniform(.9,1.36))
            if zone['kind']=='snow_transition':scale*=max(.55,1-(float(h[i])-140)/260)
        add('tree',key,px,pz,scale,float(rng.uniform(-math.pi,math.pi)),zone['id']);retained.append((px,pz));bins.setdefault(cell,[]).append((px,pz,spacing))
    # Seed distinct plant beds near some trees; do not carpet every shaded
    # square with the same bright grass. Clear trails and foundations remain.
    tree_count=len(placements)-first
    per_tree=11 if zone['kind']=='forest' else (4 if zone['kind']=='dead_forest' else 2)
    centers=np.array(retained)
    if len(centers):
        cluster=np.repeat(centers,per_tree,axis=0);angle=rng.uniform(0,math.tau,len(cluster));radius=rng.uniform(.75,5.5,len(cluster))
        px=cluster[:,0]+np.cos(angle)*radius;pz=cluster[:,1]+np.sin(angle)*radius
        bed=(road_distance(px,pz)>.65)&valid_area(px,pz)&(polygon_field(px,pz,zone['polygon'])<0)
        for i in np.flatnonzero(bed):
            if rng.random()<.075:key='shrub_04_0';kind='shrub';scale=float(rng.uniform(.8,1.6))
            else:key=f'fern_02_{int(rng.integers(4))}';kind='fern';scale=float(rng.uniform(.85,1.65))
            add(kind,key,float(px[i]),float(pz[i]),scale,float(rng.uniform(-math.pi,math.pi)),zone['id'])
        # Rock and fallen wood arrangements are local companions of a subset
        # of tree groups, not one identical object at every trunk.
        for px,pz in retained[::15]:
            key=f'rock_moss_set_01_{int(rng.integers(6))}' if rng.random()<.55 else ('fallen_trunk_0' if rng.random()<.65 else 'stump_0')
            kind='rock' if key.startswith('rock') else 'deadwood'
            scale=float(rng.uniform(.6,1.15));desc=catalog[key]['lods'][0]
            extent=math.hypot(desc['high'][0]-desc['low'][0],desc['high'][2]-desc['low'][2])*scale
            xx=np.asarray(px+2.2);zz=np.asarray(pz-1.6)
            if float(road_distance(xx,zz))<extent+.75 or not bool(valid_area(xx,zz,extent)):continue
            add(kind,key,float(xx),float(zz),scale,float(rng.uniform(-math.pi,math.pi)),zone['id'])
    zone_results.append({'id':zone['id'],'polygon_area_m2':area,'new_trees':tree_count,'new_total':len(placements)-first})
    print('WORLD_NATURE_ZONE '+json.dumps(zone_results[-1]),flush=True)

# Denser, irregular fern beds in the retained sample do not move its trees.
px=rng.uniform(-727,-563,7000);pz=rng.uniform(-142,22,7000);allowed=(road_distance(px,pz)>.65)&valid_area(px,pz)
for i in np.flatnonzero(allowed):add('fern',f'fern_02_{int(rng.integers(4))}',float(px[i]),float(pz[i]),float(rng.uniform(.85,1.65)),float(rng.uniform(-math.pi,math.pi)),'living_forest_sample')

collision=list(json.loads((OUT/'collision-D03.json').read_text())['obstacles']);sample_ids={p['id'] for p in sample['placements']}
for p in placements:
    if p['id'] in sample_ids:continue
    if p['kind'] not in ('tree','rock','deadwood'):continue
    x,y,z=p['position'];s=p['scale'];yaw=p['yaw'];d=catalog[p['asset']]['lods'][0]
    if p['kind']=='tree':
        prof=profiles[p['asset']];cx=prof['x']*s;cz=prof['z']*s
        center=[x+cx*math.cos(yaw)+cz*math.sin(yaw),z-cx*math.sin(yaw)+cz*math.cos(yaw)]
        entry={'kind':'circle','x':center[0],'z':-center[1],'radius':prof['radius']*s}
    else:
        cx=(d['low'][0]+d['high'][0])*.5*s;cz=(d['low'][2]+d['high'][2])*.5*s
        entry={'kind':'box','x':x+cx*math.cos(yaw)+cz*math.sin(yaw),'z':-(z-cx*math.sin(yaw)+cz*math.cos(yaw)),'halfX':(d['high'][0]-d['low'][0])*.5*s,'halfZ':(d['high'][2]-d['low'][2])*.5*s,'rotation':-yaw}
    entry.update(id=p['id'],source_mesh=p['asset'],landmark=p['id'],bottom=p['ground']-.1,top=y+d['high'][1]*s,blocksMovement=True);collision.append(entry)

counts=dict(collections.Counter(p['kind'] for p in placements))
document={'revision':'D08','scope':'Full authored forest masks and snow/swamp treelines; final geology/material/atmosphere work remains','catalog':catalog,'placements':placements,'counts':counts,'zones':zone_results,'full_world':False,'bounds_xz':[-800,-700,800,700],'seed':202609108,'sample_preserved_ids':len(sample_ids),'layout_sha256':hashlib.sha256((ROOT/'godot-pc/world-final/world_layout.json').read_bytes()).hexdigest(),'families_source':families['native_source'],'actual_canopy_verified':False}
DEST.write_text(json.dumps(document,separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
(OUT/'collision-D08.json').write_text(json.dumps({'schema':1,'obstacles':collision},separators=(',',':'))+'\n',encoding='utf-8',newline='\n')
print('WORLD_NATURE_PERSISTED '+json.dumps({'counts':counts,'colliders':len(collision)}),flush=True)

# Material mask uses world coordinates and the very same road/forest outlines.
x,z=np.meshgrid(np.linspace(-800,800,1601),np.linspace(-700,700,1401));road=np.clip((.5-road_distance(x,z))/1.0,0,1)
forest=np.zeros(x.shape)
for zone in zones:
    if zone['kind'] in ('forest','dead_forest'):forest=np.maximum(forest,np.clip(-polygon_field(x,z,zone['polygon'])/8,0,1))
for clearing in layout['masks']:
    if clearing['kind']=='clearing':forest*=np.clip(polygon_field(x,z,clearing['polygon'])/4,0,1)
rock=np.clip((sample_grid(slope,x,z)-.4)/.65,0,1)
Image.fromarray(np.uint8(np.stack([road,forest,rock,np.ones(x.shape)],axis=-1)*255)).save(OUT/'ground-world-D08.png')
(OUT/'world-nature-settings-D08.json').write_text(json.dumps({'bounds_xz':[-800,-700,800,700],'mask':'ground-world-D08.png','forest_masks':[z['id'] for z in zones],'preserved_sample':'authored-D03.json','placements':'placements-D08.json','manual_edit_rule':'Edit stable placement entries; build refuses overwrite. Native point attributes preserve indices and transforms. Runtime never regenerates.','density_controls':{'dense_minimum_trunk_distance_m':3.8,'ordinary_m':5.1,'edge_m':7.4,'dead_forest_m':6.6},'canopy_actual_verification_pending':True},indent=2)+'\n',encoding='utf-8',newline='\n')
