"""Persist the D11 groundcover and scarp placement data once, before Blender.

Existing forest instances and geography remain untouched. Native point edits
are exported by the matching round-trip exporter, never regenerated at runtime.
"""
from pathlib import Path
import json, math, collections, hashlib
import numpy as np
from build_geography import polygon_field, segment_field, sample_grid

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'godot-pc/world-final/nature'
TARGET=OUT/'groundcover-placements-D11.json'
if TARGET.exists():raise RuntimeError('Preserve saved placements; choose a new revision')
layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text())
library=json.loads((OUT/'groundcover-library-D11A.json').read_text())
height=np.fromfile(ROOT/'godot-pc/world-final/geography/heightmap.f32',dtype='<f4').reshape(701,801)
hz,hx=np.gradient(height,2,2);slope=np.hypot(hx,hz)
gx,gz=np.meshgrid(np.linspace(-800,800,801),np.linspace(-700,700,701))
road=np.full(gx.shape,1e6)
for r in layout['roads']:
    d,_=segment_field(gx,gz,r['points_xyz']);road=np.minimum(road,d-r['width']/2)
lake=polygon_field(gx,gz,layout['water']['lake']['polygon'])
swamp=polygon_field(gx,gz,layout['water']['swamp']['polygon'])
river,_=segment_field(gx,gz,layout['water']['river']['centerline_xyz'])
river-=layout['water']['river']['width']/2
building=np.ones(gx.shape,dtype=bool)
obstacles=json.loads((ROOT/'godot-pc/world-final/geography/collision.json').read_text())['obstacles']
# Limit each obstacle raster operation to its local bounding rectangle.
for o in obstacles:
    if not o.get('blocksMovement'):continue
    radius=float(o.get('radius',math.hypot(o.get('halfX',0),o.get('halfZ',0))))+1.6
    x,z=float(o['x']),-float(o['z'])
    x0=max(0,math.floor((x-radius+800)/2));x1=min(801,math.ceil((x+radius+800)/2)+1)
    z0=max(0,math.floor((z-radius+700)/2));z1=min(701,math.ceil((z+radius+700)/2)+1)
    dx=gx[z0:z1,x0:x1]-x;dz=-(gz[z0:z1,x0:x1]-z)
    if o['kind']=='circle':hit=dx*dx+dz*dz<(o['radius']+.65)**2
    else:
        yaw=float(o.get('rotation',0));xx=dx*math.cos(yaw)+dz*math.sin(yaw);zz=-dx*math.sin(yaw)+dz*math.cos(yaw)
        hit=(abs(xx)<o['halfX']+.65)&(abs(zz)<o['halfZ']+.65)
    building[z0:z1,x0:x1]&=~hit
living=np.zeros(gx.shape);dead=np.zeros(gx.shape)
for mask in layout['masks']:
    if mask['kind'] not in ('forest','dead_forest'):continue
    distance=polygon_field(gx,gz,mask['polygon'])
    # Irregular outer beds extend past the straight polygon boundary without
    # moving or removing the already saved forest canopy.
    ripple=8*np.sin(gx*.081+np.sin(gz*.034))+6*np.cos(gz*.064)
    field=np.clip((14-distance+ripple)/28,0,1)
    if mask['kind']=='forest':living=np.maximum(living,field)
    else:dead=np.maximum(dead,field)
wet=((swamp<0)&(height<17.5))|((lake<12)&(lake>1))|((river<6)&(river>1))
safe=np.zeros(gx.shape,dtype=bool)
for loc in layout['locations']:
    if loc['id'] in ('L01','L02'):safe|=polygon_field(gx,gz,loc['outline_xz'])<0
volcano=polygon_field(gx,gz,next(l['outline_xz'] for l in layout['locations'] if l['id']=='L09'))<0
eligible=(road>1.1)&(lake>1)&(river>1)&building&(slope<.6)&(height<195)&~safe
eligible&=~((swamp<0)&(height<12.7));eligible&=~(volcano&(height>115))
patch=.68+.22*np.sin(gx*.14+np.cos(gz*.06))*np.sin(gz*.11)+.1*np.sin((gx+gz)*.047)
density=np.where(living>.1,.9*living+.35*(1-living),np.where(dead>.1,.42,.24))*patch
density=np.where(wet,.74,density)
prob=np.where(eligible,density,0)

rng=np.random.default_rng(202609111)
xx,zz=np.meshgrid(np.arange(-797,798,1.08),np.arange(-697,698,1.08))
x=xx.ravel()+rng.uniform(-.48,.48,xx.size);z=zz.ravel()+rng.uniform(-.48,.48,xx.size)
choose=rng.random(x.size)<sample_grid(prob,x,z)
x=x[choose];z=z[choose]
# Bilinear exclusion masks are conservative enough for the grass radius;
# exact cliff and movement clearance are checked separately below.
good=(sample_grid(eligible.astype(float),x,z)>.999)&(sample_grid(road,x,z)>1.15)
x=x[good];z=z[good];n=len(x)
is_wet=sample_grid(wet.astype(float),x,z)>.5
is_forest=sample_grid(living,x,z)>.5
roll=rng.random(n)
keys=np.where(is_wet,'sedge_wet',np.where(is_forest,np.where(roll<.6,'grass_shade','grass_short'),np.where(roll<.20,'grass_dry','grass_meadow')))
positions=np.column_stack([x,sample_grid(height,x,z)-.025,z,rng.uniform(-math.pi,math.pi,n),rng.uniform(.8,1.25,n),sample_grid(hx,x,z),sample_grid(hz,x,z)])
cells=collections.defaultdict(list)
for index,(key,p) in enumerate(zip(keys,positions)):
    cells[(str(key),math.floor(p[0]/32),math.floor(p[2]/32))].append([*[round(float(v),5) for v in p],index])
grass=[{'asset':key,'cell':[cx,cz],'points':pts} for (key,cx,cz),pts in cells.items()]
print('D11_GRASS_SAVED_POINTS '+str(n)+' cells '+str(len(grass)),flush=True)

# Pick separated real outcrops on slope contours in the approved mountain,
# crater, cave/mine and lakeshore regions. No scarp may cover any road.
regions=[('snow',next(l['outline_xz'] for l in layout['locations'] if l['id']=='L04'),140,400),
    ('volcano',next(l['outline_xz'] for l in layout['locations'] if l['id']=='L09'),120,360),
    ('mine',next(l['outline_xz'] for l in layout['locations'] if l['id']=='L05'),80,260),
    ('lake',next(l['outline_xz'] for l in layout['locations'] if l['id']=='L06'),44,100)]
cliffs=[]
for zone,poly,minh,maxh in regions:
    candidates=np.argwhere((polygon_field(gx,gz,poly)<-18)&(height>minh)&(height<maxh)&(slope>.2)&(slope<1.0)&(road>27)&building)
    rng.shuffle(candidates)
    retained=[];limit={'snow':55,'volcano':62,'mine':18,'lake':16}[zone]
    for zi,xi in candidates:
        px,pz=float(gx[zi,xi]),float(gz[zi,xi])
        if any((px-a)**2+(pz-b)**2<26**2 for a,b in retained):continue
        scale=float(rng.uniform(.9,1.45));key=f'cliff_face_{int(rng.integers(4))}'
        desc=library['catalog'][key]['lods'][0]
        yaw=math.atan2(-float(hx[zi,xi]),-float(hz[zi,xi]))
        corners=[]
        for lx in [desc['low'][0],desc['high'][0]]:
            for lz in [desc['low'][2],desc['high'][2]]:
                corners.append((px+scale*(lx*math.cos(yaw)+lz*math.sin(yaw)),pz+scale*(-lx*math.sin(yaw)+lz*math.cos(yaw))))
        # A full bounding disk, not just its centre, clears paths and houses.
        radius=max(math.hypot(a-px,b-pz) for a,b in corners)
        if float(road[zi,xi])<radius+3:continue
        c=np.array(corners)
        if not np.all(sample_grid(building.astype(float),c[:,0],c[:,1])>.999):continue
        if float(polygon_field(np.asarray(px),np.asarray(pz),layout['water']['lake']['polygon']))<radius+1:continue
        cliffs.append({'id':f'D11_cliff_{len(cliffs):03}','asset':key,'zone':zone,'position':[px,float(height[zi,xi]),pz],'scale':scale,'yaw':yaw,'conform_edges':True,'minimum_road_margin_m':float(road[zi,xi])-radius})
        retained.append((px,pz))
        if len(retained)>=limit:break
    print('D11_CLIFF_ZONE '+zone+' '+str(len(retained)),flush=True)
report={'revision':'D11','catalog':library['catalog'],'grass_point_fields':['x','y','z','yaw','scale','height_dx','height_dz','stable_index'],
    'grass_cells':grass,'cliffs':cliffs,'counts':{'grass_tufts':n,'grass_cells':len(grass),'cliffs':len(cliffs),'by_asset':dict(collections.Counter(str(k) for k in keys))},
    'existing_forest_removed':0,'existing_heightmap_changed':False,'main_game_integrated':False,'visual_verified':False,
    'source_layout_sha256':hashlib.sha256((ROOT/'godot-pc/world-final/world_layout.json').read_bytes()).hexdigest()}
TARGET.write_text(json.dumps(report,separators=(',',':'))+'\n',encoding='utf-8')
(ROOT/'docs/world-final/groundcover-D11.json').write_text(json.dumps({k:v for k,v in report.items() if k not in ('catalog','grass_cells','cliffs')},indent=2)+'\n',encoding='utf-8')
print('D11_PERSISTED '+json.dumps(report['counts']),flush=True)
