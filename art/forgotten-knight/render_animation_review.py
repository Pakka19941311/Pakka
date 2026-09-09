"""Render the actual fitted knight's licensed motions into a labelled 30fps reel.
Usage: blender -b -t 4 --python render_animation_review.py -- --master MASTER.blend --out DIR [--probe] [--samples 4]
Only preview scene state is changed. The master and gameplay clips are never saved over.
"""
import argparse,json,math,time,hashlib,sys,os,subprocess
from pathlib import Path
import bpy
from mathutils import Vector
FPS=30

def timeline():
    segments=[]
    def add(title,poses):segments.append({'title':title,'poses':poses})
    def clip(action,n,weapon=True,height=None):
        return [{'action':action,'frame':i,'weapon':weapon,'jump_z':round(height(i),6) if height else 0} for i in range(n)]
    add('Стойка / дыхание',clip('idle_weapon',50)*2)
    add('Бег',clip('run_weapon',28)*3)
    add('Удар мечом',clip('sword_attack',47)*2)
    add('Каст магии',clip('cast_enter',16,False)+clip('cast_loop',42,False)+clip('cast_release',16,False)+clip('cast_exit',14,False))
    hit=clip('hit',11)+clip('idle_weapon',18)
    add('Получение урона',hit*2)
    jump=[]
    for action,n in [('jump_start',41),('jump_air',15),('jump_land',39)]:
        for i in range(n):
            elapsed=(len(jump)-30)/FPS;duration=26/FPS
            h=.5*9.81*elapsed*(duration-elapsed) if 0<elapsed<duration else 0
            jump.append({'action':action,'frame':i,'weapon':True,'jump_z':round(h,6)})
    add('Прыжок / приземление',jump)
    for seg in segments:
        camera_id='standing' if seg['title'] in ['Стойка / дыхание','Каст магии','Получение урона'] else seg['title']
        for pose in seg['poses']:pose['camera_id']=camera_id
    return segments

def apply_pose(scene,rig,sword,p):
    rig.animation_data.action=bpy.data.actions[p['action']]
    rig.location.z=.02+p['jump_z']
    sword.hide_render=not p['weapon']
    scene.frame_set(p['frame']);bpy.context.view_layer.update()

def fit_camera(scene,rig,sword,segments):
    cam=scene.camera;cam.data.type='ORTHO'
    look=Vector((3.4,-6.5,1.28)).normalized()
    q=(-look).to_track_quat('-Z','Y');cam.rotation_euler=q.to_euler()
    right=q@Vector((1,0,0));up=q@Vector((0,1,0));origin=Vector((0,0,1))
    xs=[];ys=[]
    assets=[o for o in bpy.data.collections['Forgotten_Knight_Fitted'].objects if o.type=='MESH' and not o.hide_render]
    if sword not in assets:assets.append(sword)
    for segment in segments:
        poses=segment['poses'];samples=poses[::max(1,len(poses)//16)]+[poses[-1]]
        for p in samples:
            apply_pose(scene,rig,sword,p);dg=bpy.context.evaluated_depsgraph_get()
            for o in assets:
                if o.hide_render:continue
                e=o.evaluated_get(dg)
                for vertex in e.data.vertices:
                    pt=e.matrix_world@vertex.co-origin;xs.append(pt.dot(right));ys.append(pt.dot(up))
    center=origin+right*((min(xs)+max(xs))*.5)+up*((min(ys)+max(ys))*.5)
    aspect=scene.render.resolution_x/scene.render.resolution_y
    cam.data.ortho_scale=max(max(ys)-min(ys),(max(xs)-min(xs))/aspect)*1.13
    cam.location=center+look*8
    return {'ortho_scale':cam.data.ortho_scale,'location':list(cam.location),'rotation_euler':list(cam.rotation_euler),'projected_bounds':{'x':[min(xs),max(xs)],'y':[min(ys),max(ys)]}}

def set_camera(scene,camera):
    scene.camera.location=camera['location'];scene.camera.rotation_euler=camera['rotation_euler'];scene.camera.data.ortho_scale=camera['ortho_scale']

def configure(scene,samples,width,height):
    scene.render.fps=FPS;scene.render.engine='BLENDER_EEVEE_NEXT'
    scene.eevee.taa_render_samples=samples
    scene.render.resolution_x=width;scene.render.resolution_y=height;scene.render.resolution_percentage=100
    # Review studio only: keep PBR lighting, one deterministic key shadow.
    for light in bpy.data.lights:
        light.use_shadow=light.name=='Key'
        if light.name=='Key':light.energy=1500;light.size=1.0
        elif light.name=='Fill':light.energy=300
        elif light.name=='Rim':light.energy=500
        if hasattr(light,'use_shadow_jitter'):light.use_shadow_jitter=False
    if hasattr(scene.eevee,'use_shadow_jitter_viewport'):scene.eevee.use_shadow_jitter_viewport=False
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGB'
    scene.render.film_transparent=False
    scene.render.image_settings.compression=15
    scene.render.use_file_extension=True


def encode(out,segments,lookup,manifest):
    # Reuse complete animation loops; every unique pose is rendered at 30fps.
    seq=out/'sequence';seq.mkdir(exist_ok=True);fr=0
    for seg in segments:
        seg['start_frame']=fr
        for p in seg['poses']:
            key=json.dumps(p,sort_keys=True);src=out/'unique'/f'{lookup[key]:06d}.png';dst=seq/f'{fr:06d}.png'
            if not src.exists() or src.stat().st_size<1000:raise RuntimeError(f'Missing rendered frame: {src}')
            if not dst.exists():dst.symlink_to(src)
            fr+=1
        seg['end_frame']=fr
    font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    # Mild spatial-only grain reduction. Bilateral never reads neighboring frames.
    filters=["format=yuv444p","bilateral=sigmaS=0.65:sigmaR=0.04:planes=1","pad=width=iw:height=ih+112:x=0:y=76:color=0x101722"]
    for seg in segments:
        title=seg['title'].replace("'",'')
        filters.append(f"drawtext=fontfile={font}:text='{title}':fontcolor=0xe6d3ab:fontsize=24:x=(w-tw)/2:y=22:enable='between(n,{seg['start_frame']},{seg['end_frame']-1})'")
    filters.append("drawtext=fontfile="+font+":text='VARENDOR  /  FORGOTTEN KNIGHT':fontcolor=0xa7b0bb:fontsize=13:x=(w-tw)/2:y=h-25")
    video=out/'Varendor_Forgotten_Knight_Animation_Review.mp4'
    subprocess.run(['ffmpeg','-y','-framerate',str(FPS),'-i',str(seq/'%06d.png'),'-vf',','.join(filters),'-frames:v',str(fr),'-c:v','libx264','-threads','4','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',str(video)],check=True)
    manifest['video']=str(video);manifest['frame_count']=fr;manifest['duration_seconds']=fr/FPS
    manifest['video_resolution']=[manifest['resolution'][0],manifest['resolution'][1]+112]
    manifest['caption_layout']='Separate 76px header and 36px footer; captions never cover character or sword.'
    manifest['postprocessing']='Mild spatial-only bilateral luma denoise (sigmaS=0.65, sigmaR=0.04). No temporal filtering, interpolation or motion synthesis.'
    manifest['segments']=[{k:v for k,v in s.items() if k!='poses'} for s in segments]
    (out/'render_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print('VIDEO_READY',str(video),flush=True)


def main():
    ap=argparse.ArgumentParser();ap.add_argument('--master',required=True);ap.add_argument('--out',required=True);ap.add_argument('--probe',action='store_true');ap.add_argument('--probe-frames',type=int,default=3);ap.add_argument('--samples',type=int,default=2);ap.add_argument('--width',type=int,default=512);ap.add_argument('--height',type=int,default=640);ap.add_argument('--worker',type=int,default=0);ap.add_argument('--workers',type=int,default=1);ap.add_argument('--encode-only',action='store_true');ap.add_argument('--actions',nargs='+');ap.add_argument('--force',action='store_true');args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True);(out/'unique').mkdir(exist_ok=True)
    master=Path(args.master).resolve();segments=timeline();lookup={};unique=[]
    for seg in segments:
        for p in seg['poses']:
            key=json.dumps(p,sort_keys=True)
            if key not in lookup:lookup[key]=len(unique);unique.append(p)
    if args.encode_only:
        manifest=json.loads((out/'render_manifest_worker0.json').read_text())
        timings={t['index']:t for t in manifest['timings']};sources=[]
        for source in sorted(out.glob('render_manifest_worker*.json'))+sorted(out.glob('render_manifest_patch_*.json')):
            data=json.loads(source.read_text());timings.update({t['index']:t for t in data['timings']})
            sources.append({'manifest':source.name,'master_sha256':data['master_sha256'],'actions':data.get('selected_actions')})
            if data.get('selected_actions'):
                manifest['framing'].update(data['framing']);manifest['master_sha256']=data['master_sha256']
        manifest['timings']=[timings[i] for i in sorted(timings)];manifest['render_sources']=sources
        current_sha=hashlib.sha256(master.read_bytes()).hexdigest()
        if current_sha!=manifest['master_sha256']:raise RuntimeError('Master changed after the most recent rendered revision.')
        encode(out,segments,lookup,manifest);return
    bpy.ops.wm.open_mainfile(filepath=str(master),use_scripts=False);scene=bpy.context.scene
    rig=bpy.data.objects['FK_Humanoid_Rig'];sword=bpy.data.objects['FK_weapon_sword']
    configure(scene,args.samples,args.width,args.height)
    selected=set(args.actions or [])
    if selected-set(bpy.data.actions.keys()):raise ValueError(f'Unknown actions: {selected-set(bpy.data.actions.keys())}')
    camera_ids=list(dict.fromkeys(p['camera_id'] for s in segments for p in s['poses'] if not selected or p['action'] in selected))
    framing={key:fit_camera(scene,rig,sword,[s for s in segments if s['poses'][0]['camera_id']==key]) for key in camera_ids}
    manifest={'master':str(master),'master_sha256':hashlib.sha256(master.read_bytes()).hexdigest(),'render_engine':'BLENDER_EEVEE_NEXT','samples':args.samples,'fps':FPS,'resolution':[args.width,args.height],'framing':framing,'unique_frames':len(unique),'timings':[],'preview_only':'Jump adds ballistic root height with gravity9.81; sword hidden for cast. Master and clips unchanged.','poses':unique}
    if selected:manifest['selected_actions']=sorted(selected)
    manifest_name='probe_manifest.json' if args.probe else ('render_manifest_patch_'+'_'.join(sorted(selected))+f'_worker{args.worker}.json' if selected else f'render_manifest_worker{args.worker}.json')
    print('RENDER_PLAN',len(unique),'unique',sum(len(s['poses']) for s in segments),'output frames',framing,flush=True)
    if args.probe:
        probe=out/'probe';probe.mkdir(exist_ok=True);jobs=[(i,unique[i],probe/f'{i:06d}.png') for i in range(args.probe_frames)]
    else:jobs=[(i,p,out/'unique'/f'{i:06d}.png') for i,p in enumerate(unique) if i%args.workers==args.worker and (not selected or p['action'] in selected)]
    overall=time.monotonic()
    for i,p,path in jobs:
        if path.exists() and path.stat().st_size>1000 and not args.probe and not args.force:continue
        apply_pose(scene,rig,sword,p);set_camera(scene,framing[p['camera_id']]);scene.render.filepath=str(path);start=time.monotonic();bpy.ops.render.render(write_still=True);elapsed=time.monotonic()-start
        manifest['timings'].append({'index':i,'action':p['action'],'frame':p['frame'],'render_seconds':round(elapsed,3)})
        print('FRAME_DONE',i,p['action'],p['frame'],'seconds',round(elapsed,3),'elapsed',round(time.monotonic()-overall,1),flush=True)
        if len(manifest['timings'])%10==0:(out/manifest_name).write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    (out/manifest_name).write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    if not args.probe and args.workers==1 and not selected:encode(out,segments,lookup,manifest)
    elif not args.probe:print('WORKER_COMPLETE',args.worker,flush=True)

if __name__=='__main__':main()
