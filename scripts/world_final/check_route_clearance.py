"""Measure authored road clearance against footprints exported from Blender."""
from pathlib import Path
import json, math, sys
import numpy as np
ROOT=Path(__file__).resolve().parents[2]

def clearance(points, obstacle):
    offset=points-np.array([obstacle['x'],-obstacle['z']])
    if obstacle['kind']=='circle':return np.linalg.norm(offset,axis=1)-obstacle['radius']
    angle=-obstacle['rotation'];c,s=math.cos(angle),math.sin(angle)
    local=offset@np.array([[c,s],[-s,c]])
    q=np.abs(local)-[obstacle['halfX'],obstacle['halfZ']]
    return np.linalg.norm(np.maximum(q,0),axis=1)+np.minimum(np.max(q,axis=1),0)

def check(collision_path):
    layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
    obstacles=json.loads(collision_path.read_text('utf-8'))['obstacles']
    results=[]
    for road in layout['roads']+layout.get('review_routes',[]):
        samples=[]
        for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):
            a=np.array(a)[[0,2]];b=np.array(b)[[0,2]]
            samples.extend(np.linspace(a,b,max(2,math.ceil(np.linalg.norm(a-b)*4))))
        points=np.array(samples);hits=[];min_clear=1e9;nearest=None
        for obstacle in obstacles:
            if not obstacle['blocksMovement']:continue
            d=clearance(points,obstacle);i=int(np.argmin(d))
            if d[i]<min_clear:min_clear=float(d[i]);nearest=obstacle['id']
            if d[i]<.46:hits.append({'mesh':obstacle['id'],'clearance':round(float(d[i]),3),'point':points[i].round(3).tolist()})
        results.append({'road':road['id'],'pass':not hits,'min_clearance_m':round(min_clear,3),'nearest_mesh':nearest,'blocked':hits})
    return {'radius_m':.46,'sample_interval_m':.25,'source':str(collision_path.relative_to(ROOT)),'all_pass':all(r['pass'] for r in results),'routes':results}

if __name__=='__main__':
    path=ROOT/(sys.argv[1] if len(sys.argv)>1 else 'godot-pc/world-final/geography/collision.json')
    result=check(path)
    out=ROOT/'docs/world-final/route-clearance.json';out.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(json.dumps({'all_pass':result['all_pass'],'failed':[r for r in result['routes'] if not r['pass']]}))
