"""Compile authored geographic constraints into a continuous shared support grid.

Produces data consumed by Blender and Godot. It never writes the authored layout.
All terrain chunks share vertices on their boundary; height_at uses their exact
triangle split. River crossings are separate decks, not causeways filling water.
"""
from pathlib import Path
import hashlib, json, math
import numpy as np

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'godot-pc/world-final/geography'

def smooth(t):
    t=np.clip(t,0,1); return t*t*(3-2*t)

def segment_field(x,z,points):
    nearest=np.full(x.shape,np.inf);height=np.zeros(x.shape)
    for a,b in zip(points,points[1:]):
        dx,dz=b[0]-a[0],b[2]-a[2]
        t=np.clip(((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz),0,1)
        d=np.hypot(x-a[0]-dx*t,z-a[2]-dz*t)
        take=d<nearest; height=np.where(take,a[1]+(b[1]-a[1])*t,height); nearest=np.minimum(nearest,d)
    return nearest,height

def polygon_field(x,z,polygon):
    inside=np.zeros(x.shape,dtype=bool); distance=np.full(x.shape,np.inf)
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        ax,az=a;bx,bz=b
        if bz!=az:inside^=((az>z)!=(bz>z)) & (x<(bx-ax)*(z-az)/(bz-az)+ax)
        dx,dz=bx-ax,bz-az
        t=np.clip(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1)
        distance=np.minimum(distance,np.hypot(x-ax-dx*t,z-az-dz*t))
    return np.where(inside,-distance,distance)

def sample_grid(heights,x,z):
    gx=np.clip((np.asarray(x)+800)/2,0,800);gz=np.clip((np.asarray(z)+700)/2,0,700)
    ix=np.minimum(gx.astype(int),799);iz=np.minimum(gz.astype(int),699)
    u=gx-ix;v=gz-iz
    a=heights[iz,ix];b=heights[iz,ix+1];c=heights[iz+1,ix];d=heights[iz+1,ix+1]
    return np.where(u>=v,a+u*(b-a)+v*(d-b),a+u*(d-c)+v*(c-a))

def build():
    layout_path=ROOT/'godot-pc/world-final/world_layout.json'
    layout=json.loads(layout_path.read_text('utf-8'))
    OUT.mkdir(parents=True,exist_ok=True)
    x,z=np.meshgrid(np.arange(-800,801,2,dtype=float),np.arange(-700,701,2,dtype=float))
    def hill(cx,cz,rx,rz):return np.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2))
    # Connected northern uplands descend through wooded foothills into the south.
    noise=(np.sin(x*.011+np.cos(z*.015))*np.sin(z*.017+x*.004)*5.8+
           np.sin(x*.041+z*.024)*np.cos(z*.035)*2.3+np.sin(x*.11-z*.06)*.65)
    north=smooth((-z+160)/790)
    h=18+29*north+noise+38*hill(-160,-190,660,465)+19*hill(-430,100,350,330)
    h+=75*hill(-225,-458,300,240)+62*hill(30,-490,165,185)
    # Irregular ridge system, no isolated cones on a flat plane.
    ridge=168*hill(-590,-548,245,205)+87*hill(-699,-619,88,123)+95*hill(-440,-615,82,102)
    striation=np.abs(np.sin(x*.028+z*.017+np.sin(z*.009)*2))
    h+=ridge*(.82+.18*striation)+17*hill(235,-352,180,70)
    vx=(x-545);vz=(z+490)*1.12;radius=np.hypot(vx,vz)
    theta=np.arctan2(vz,vx)
    distorted=radius*(1+.044*np.sin(theta*5)+.022*np.cos(theta*9))
    foot=175*np.exp(-(distorted/278)**2)
    rim=130*np.exp(-((distorted-171)/48)**2)
    volcano=np.maximum(foot,rim+124*np.exp(-(distorted/310)**2))
    inner=smooth((155-distorted)/65)
    volcano_mix=1-smooth((radius-280)/140)
    h=h*(1-volcano_mix)+np.maximum(h,48+volcano*(.96+.04*np.cos(theta*13)))*volcano_mix
    h=h*(1-inner)+216*inner
    # Lake: signed outline preserves coves and promontories from the reference.
    lake=polygon_field(x,z,layout['water']['lake']['polygon'])
    lake_mix=1-smooth(np.maximum(lake,0)/39)
    lake_bed=40+np.where(lake<0,np.maximum(-15,lake*.26),lake*.15)
    h=h*(1-lake_mix)+lake_bed*lake_mix
    river_dist,river_y=segment_field(x,z,layout['water']['river']['centerline_xyz'])
    bank=1-smooth((river_dist-10)/17)
    bed=river_y-4.5+np.maximum(0,river_dist-7)*.38
    h=h*(1-bank)+np.minimum(h,bed)*bank
    swamp=polygon_field(x,z,layout['water']['swamp']['polygon'])
    swamp_mix=1-smooth((swamp+25)/60)
    wetground=13+np.sin(x*.037+z*.019)*1.5+np.cos(z*.056)*.65
    h=h*(1-swamp_mix)+wetground*swamp_mix
    # Blend measured architectural platforms into the surrounding topography.
    for p in layout['platforms']:
        d=np.maximum(np.abs(x-p['x'])-p['size'][0]/2,np.abs(z-p['z'])-p['size'][1]/2)
        w=1-smooth(d/p['blend']);h=h*(1-w)+p['y']*w
    # Nearest road wins where routes branch. Shared endpoints have equal levels.
    road_distance=np.full(x.shape,np.inf);road_height=np.zeros(x.shape);road_width=np.zeros(x.shape)
    for road in layout['roads']:
        d,rh=segment_field(x,z,road['points_xyz'])
        take=d<road_distance
        road_distance=np.minimum(road_distance,d);road_height=np.where(take,rh,road_height)
        road_width=np.where(take,road['width'],road_width)
    # Bridges keep the river bed underneath. Their dry approaches are flattened.
    deck=np.zeros(x.shape,dtype=bool)
    for obj in layout['objects']:
        if obj['kind']=='bridge':
            ox,oy,oz=obj['position'];sx,sy,sz=obj['size']
            deck|=(abs(x-ox)<sx*.5-10)&(abs(z-oz)<sz*.5+8)
    earthwork_blend=np.clip(np.abs(h-road_height)*1.5,14,80)
    road_mix=1-smooth((road_distance-road_width*.5-2)/earthwork_blend)
    road_mix=np.where(deck,0,road_mix)
    h=h*(1-road_mix)+road_height*road_mix
    # Smooth the sub-grid projection at tight bends; render and collision still
    # consume this same resulting grid, not separate interpolated road surfaces.
    for _ in range(2):
        padded=np.pad(h,1,mode='edge')
        filtered=(padded[1:-1,:-2]+2*padded[1:-1,1:-1]+padded[1:-1,2:])/4
        padded=np.pad(filtered,((1,1),(0,0)),mode='edge')
        filtered=(padded[:-2]+2*padded[1:-1]+padded[2:])/4
        h=h*(1-road_mix)+filtered*road_mix
    h=h.astype('<f4')
    # Road pigment is a mask in the same mesh, not a floating surface.
    road_mask=(1-smooth((road_distance-road_width*.5)/1.7))*(~deck)
    snow=smooth((h-172)/60)*smooth((-x+180)/320)*smooth((-z+160)/230)
    ash=(1-smooth((radius-180)/130))*smooth((h-80)/80)
    wet=1-smooth((swamp+16)/25)
    colors=np.stack([road_mask,snow,ash,wet],axis=-1).astype('<f4')
    np.savez_compressed(OUT/'terrain-data.npz',heights=h,colors=colors)
    h.tofile(OUT/'heightmap.f32')
    chunks=[]
    for row in range(0,700,64):
        for col in range(0,800,64):
            cols,rows=min(64,800-col),min(64,700-row)
            chunks.append({'id':f'cell_{col//64:02}_{row//64:02}','col':col,'row':row,'columns':cols,'rows':rows,
                           'x':-800+col*2,'z':-700+row*2,'width':cols*2,'depth':rows*2})
    meta={'schema':1,'layout_sha256':hashlib.sha256(layout_path.read_bytes()).hexdigest(),
          'width':1600,'depth':1400,'columns':800,'rows':700,'step':2,'height_format':'little-endian float32; row 0 north; +Z south',
          'triangle_split':'NW-NE-SE and NW-SE-SW','heights':'heightmap.f32','min_height':float(h.min()),'max_height':float(h.max()),
          'height_sha256':hashlib.sha256(h.tobytes()).hexdigest(),'chunks':chunks,'status':'stage-B-geography-not-final-art'}
    (OUT/'terrain.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
    route_checks=[]
    for road in layout['roads']:
        samples=[]; worst={'angle':0}
        for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):
            length=math.hypot(b[0]-a[0],b[2]-a[2]);t=np.linspace(0,1,max(2,math.ceil(length)))
            xx=a[0]+(b[0]-a[0])*t;zz=a[2]+(b[2]-a[2])*t
            yy=sample_grid(h,xx,zz)
            for obj in layout['objects']:
                if obj['kind']=='bridge':
                    ox,oy,oz=obj['position'];sx,sy,sz=obj['size']
                    yy=np.where((abs(xx-ox)<=sx/2)&(abs(zz-oz)<=sz/2),oy,yy)
            slope=np.degrees(np.arctan2(abs(np.diff(yy)),np.hypot(np.diff(xx),np.diff(zz))))
            index=int(np.argmax(slope))
            if float(slope[index])>worst['angle']:
                worst={'angle':float(slope[index]),'from':[float(xx[index]),float(yy[index]),float(zz[index])],
                       'to':[float(xx[index+1]),float(yy[index+1]),float(zz[index+1])], 'authored_a':a,'authored_b':b}
            samples.extend(slope.tolist())
        route_checks.append({'road':road['id'],'sample_interval_m':1,'max_grade_deg':round(max(samples),3),
                             'within_20_degrees':max(samples)<=20.5,'worst_sample':worst})
    checks={'width':1600,'depth':1400,'chunks':len(chunks),'shared_grid_vertices':h.size,'finite':bool(np.isfinite(h).all()),
            'road_grades':route_checks,'all_road_grades_pass':all(c['within_20_degrees'] for c in route_checks),
            'controller_traversal':'pending actual Godot run','visual_comparison':'pending Godot render'}
    (ROOT/'docs/world-final/geography-checks.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'chunks':len(chunks),'height_range':[meta['min_height'],meta['max_height']],
                      'failed_grades':[c for c in route_checks if not c['within_20_degrees']]}),flush=True)

if __name__=='__main__':build()
