"""Render native Blender asset motion and equipment swaps; never edit master."""
import argparse,sys,json,hashlib,time
from pathlib import Path
import bpy
import numpy as np
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'forgotten-knight'))
from render_animation_review import configure,encode
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_knight_v2 import set_loadout

FULL=['helmet_closed','armor_chest','armor_gloves','armor_boots','armor_belt','sword']
def timeline():
 def poses(action,n,items,camera='body'):
  return [{'action':action,'frame':f,'items':items,'camera_id':camera} for f in range(n)]
 segments=[]
 def add(title,p):segments.append({'title':title,'poses':p})
 add('Старт: тело и обычные штаны',poses('idle',30,[])*2)
 add('Бег без доспехов',poses('run',28,[])*3)
 add('Шлем 1: открытый',poses('idle',30,['helmet_open'])*2)
 add('Шлем 2: закрытый',poses('idle',30,['helmet_closed'])*2)
 add('Нагрудник + перчатки + сапоги',poses('idle',30,FULL)*2)
 add('Замена шлема на том же теле',poses('idle',30,['helmet_open']+FULL[1:])*2)
 add('Снятие экипировки',poses('idle',30,[]))
 combo=[]
 for i in range(1,6):combo+=poses(f'combo_{i:02d}',30,FULL,'combo')
 add('Автоатака: связка из 5 ударов',combo*2)
 return segments

def apply(scene,rig,objects,p):
 set_loadout(objects,p['items']);rig.animation_data.action=bpy.data.actions[p['action']];rig.location.z=.02;scene.frame_set(p['frame']);bpy.context.view_layer.update()

def framing(scene,rig,objects,segments):
 cam=scene.camera;cam.data.type='ORTHO';look=Vector((3.4,-6.5,1.28)).normalized();q=(-look).to_track_quat('-Z','Y');cam.rotation_euler=q.to_euler();right=q@Vector((1,0,0));up=q@Vector((0,1,0));origin=Vector((0,0,1));result={}
 for group in ['body','combo']:
  xs=[];ys=[]
  for seg in segments:
   if seg['poses'][0]['camera_id']!=group:continue
   for p in seg['poses'][::(1 if group=='combo' else 10)]:
    apply(scene,rig,objects,p);dg=bpy.context.evaluated_depsgraph_get()
    for o in objects:
     if o.type!='MESH' or o.hide_render:continue
     e=o.evaluated_get(dg)
     coords=np.empty(len(e.data.vertices)*3,dtype=np.float32);e.data.vertices.foreach_get('co',coords);coords=coords.reshape((-1,3));matrix=np.array(e.matrix_world);points=coords@matrix[:3,:3].T+matrix[:3,3]-np.array(origin);px=points@np.array(right);py=points@np.array(up);xs.extend([float(px.min()),float(px.max())]);ys.extend([float(py.min()),float(py.max())])
  center=origin+right*((min(xs)+max(xs))*.5)+up*((min(ys)+max(ys))*.5)
  scale=max(max(ys)-min(ys),(max(xs)-min(xs))*scene.render.resolution_y/scene.render.resolution_x)*1.13
  result[group]={'location':list(center+look*8),'rotation_euler':list(q.to_euler()),'ortho_scale':scale}
 return result

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--master',required=True);ap.add_argument('--out',required=True);ap.add_argument('--worker',type=int,default=0);ap.add_argument('--workers',type=int,default=1);ap.add_argument('--encode-only',action='store_true');ap.add_argument('--probe',action='store_true');ap.add_argument('--limit',type=int,default=0);ap.add_argument('--cameras-json');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(args.out);out.mkdir(exist_ok=True,parents=True);(out/'unique').mkdir(exist_ok=True);segments=timeline();lookup={};unique=[]
 for seg in segments:
  for p in seg['poses']:
   key=json.dumps(p,sort_keys=True)
   if key not in lookup:lookup[key]=len(unique);unique.append(p)
 if args.encode_only:
  manifest=json.loads((out/'worker0.json').read_text());manifest['timings']=[]
  for f in sorted(out.glob('worker*.json')):manifest['timings']+=json.loads(f.read_text())['timings']
  encode(out,segments,lookup,manifest)
  old=out/'Varendor_Forgotten_Knight_Animation_Review.mp4';new=out/'Varendor_Knight_Modular_Review.mp4';old.rename(new)
  m=json.loads((out/'render_manifest.json').read_text());m['video']=str(new);(out/'render_manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2));return
 bpy.ops.wm.open_mainfile(filepath=args.master,use_scripts=False);scene=bpy.context.scene;rig=bpy.data.objects['FK_Humanoid_Rig'];objects=list(bpy.data.collections['Forgotten_Knight_Fitted'].objects);configure(scene,2,576,640);cameras=json.loads(Path(args.cameras_json).read_text()) if args.cameras_json else framing(scene,rig,objects,segments)
 manifest={'master_sha256':hashlib.sha256(Path(args.master).read_bytes()).hexdigest(),'fps':30,'resolution':[576,640],'render_engine':'BLENDER_EEVEE_NEXT','samples':2,'unique_frames':len(unique),'framing':cameras,'timings':[],'preview_only':'Pure visual review: one normalized strike per second, five clips repeated; no game timer or damage system is running. Same accepted rig and old action curves.'}
 if args.probe:
  indices=[0,60,90,120,150,180,195,210,225,240,255,270,285]
 else:indices=[i for i in range(len(unique)) if i%args.workers==args.worker]
 print('RENDER_PLAN',len(unique),cameras,flush=True)
 for i in indices:
  p=unique[i];path=out/'unique'/f'{i:06d}.png'
  if path.exists():continue
  if args.limit and len(manifest['timings'])>=args.limit:break
  apply(scene,rig,objects,p);cam=cameras[p['camera_id']];scene.camera.location=cam['location'];scene.camera.rotation_euler=cam['rotation_euler'];scene.camera.data.ortho_scale=cam['ortho_scale'];scene.render.filepath=str(path);start=time.monotonic();bpy.ops.render.render(write_still=True);manifest['timings'].append({'index':i,'action':p['action'],'seconds':time.monotonic()-start});print('FRAME_DONE',i,p['action'],flush=True)
  if len(manifest['timings'])%10==0:(out/f'worker{args.worker}.json').write_text(json.dumps(manifest,indent=2))
 (out/f'worker{args.worker}.json').write_text(json.dumps(manifest,indent=2))
if __name__=='__main__':main()
