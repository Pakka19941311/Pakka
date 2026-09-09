"""Author knight v3 motion on the accepted skeleton; never modify the v2 source.

Blender 4.2.3. Body, equipment, materials, UVs, weights and rest skeleton stay
identical. A periodic five-cut choreography is baked once and sliced afterwards.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'art/forgotten-knight'))
from export_assets import export_options, select_assets, glb_read
sys.path.insert(0, str(ROOT / 'art/knight-v2'))
from build_knight_v2 import set_loadout, action_digest

FPS = 30
FULL = ['helmet_open', 'armor_chest', 'armor_gloves', 'armor_boots', 'armor_belt', 'sword']
CHANGED = {'idle', 'idle_weapon', 'jump_start', 'jump_air', 'jump_land', *[f'combo_{i:02d}' for i in range(1, 6)]}


def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)


def periodic(points, t):
    """Uniform periodic cubic spline; position and velocity agree at every cut."""
    i = math.floor(t)
    u = t-i
    a,b,c,d = [Vector(points[j % len(points)]) for j in [i-1,i,i+1,i+2]]
    return .5*((2*b)+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u)


class Author:
    def __init__(self, rig):
        self.rig = rig
        self.scene = bpy.context.scene
        self.bones = list(rig.pose.bones)
        self.neutral = {}
        rig.animation_data.action = bpy.data.actions['idle']
        self.scene.frame_set(0)
        for b in self.bones:
            self.neutral[b.name] = (b.rotation_quaternion.copy(), b.location.copy(), b.rotation_euler.copy())
        # The actual sword mesh determines its blade axis in the hand's rest frame.
        hand = rig.data.bones['mixamorig:RightHand']
        sword = bpy.data.objects['FK_weapon_sword']
        matrix = hand.matrix_local.inverted() @ rig.matrix_world.inverted() @ sword.matrix_world
        vertices = [matrix @ v.co for v in sword.data.vertices]
        self.blade_axis = max(vertices, key=lambda p: p.length).normalized()
        rig.animation_data.action = None
        self.rest_hip = rig.data.bones['mixamorig:Hips'].head_local.copy()
        self.feet = {s:rig.data.bones[f'mixamorig:{s}Foot'].head_local.copy() for s in ['Left','Right']}

    def bone(self, name):
        return self.rig.pose.bones['mixamorig:'+name]

    def update(self):
        bpy.context.view_layer.update()

    def reset(self):
        for b in self.bones:
            b.matrix_basis = Matrix.Identity(4)
            if any(x in b.name for x in ['Shoulder','Arm','Hand']):
                q,loc,e = self.neutral[b.name]
                b.rotation_quaternion = q
            elif b.name.startswith('cape_'):
                b.rotation_euler = self.neutral[b.name][2]

    def matrix(self, name, rotation, head):
        value = rotation.to_matrix().to_4x4()
        value.translation = head
        self.bone(name).matrix = value
        self.update()

    def orient(self, name, head, tail):
        rest = self.rig.data.bones['mixamorig:'+name]
        rotation = (rest.tail_local-rest.head_local).rotation_difference(tail-head) @ rest.matrix_local.to_quaternion()
        self.matrix(name, rotation, head)

    def limb(self, side, arm, target, pole, end_rotation=None):
        upper, lower, end = ([side+'Arm', side+'ForeArm', side+'Hand'] if arm else [side+'UpLeg',side+'Leg',side+'Foot'])
        self.update()
        head = self.bone(upper).head.copy()
        l1,l2 = self.bone(upper).length,self.bone(lower).length
        direction = target-head
        distance = max(.05, min(direction.length, l1+l2-.002))
        direction.normalize()
        target = head + direction*distance
        bend = pole-head
        bend -= direction*bend.dot(direction)
        bend.normalize()
        x = (l1*l1-l2*l2+distance*distance)/(2*distance)
        knee = head+direction*x+bend*math.sqrt(max(0.,l1*l1-x*x))
        self.orient(upper, head, knee)
        self.orient(lower, knee, target)
        if end_rotation is not None:
            self.matrix(end, end_rotation, target)
        return target

    def torso(self, height, yaw=0., lean=0., breath=0.):
        self.reset()
        hip = self.bone('Hips')
        rotation = Quaternion((0,0,1),math.radians(yaw)) @ hip.bone.matrix_local.to_quaternion()
        self.matrix('Hips',rotation,Vector((self.rest_hip.x,self.rest_hip.y,height)))
        # Small whole-spine flexion around the anatomical side axis.
        for name,angle in [('Spine1',lean*.42),('Spine2',lean*.58+breath)]:
            b=self.bone(name)
            self.matrix(name, Quaternion((1,0,0),math.radians(angle)) @ b.matrix.to_quaternion(), b.head.copy())

    def legs(self, left=None, right=None, yaw=0.):
        for side,target in [('Left',left),('Right',right)]:
            target = self.feet[side].copy() if target is None else Vector(target)
            foot = self.bone(side+'Foot')
            rotation = Quaternion((0,0,1),math.radians(yaw)) @ foot.bone.matrix_local.to_quaternion()
            self.limb(side,False,target,Vector((target.x,-1.5,.5)),rotation)

    def idle(self, t):
        breathe = math.sin(t*math.tau)
        self.torso(self.rest_hip.z-.012 + .0015*breathe,breath=.45*breathe)
        self.legs()

    def jump(self, kind, t):
        if kind=='jump_start':
            fold = smooth((t-.18)/.82)
            lift = .27*fold
            height = self.rest_hip.z-.012 + .006*math.sin(t*math.pi)
            lean = 3*fold
        elif kind=='jump_air':
            fold = 1-smooth(t)
            lift=.27*fold
            height=self.rest_hip.z-.012-.025*smooth(t)
            lean=3+2*smooth(t)
        else:
            # Contact -> quick compression -> slower controlled extension.
            compression = smooth(t/.25) if t<.25 else 1-smooth((t-.25)/.75)
            fold=0.;lift=0.
            height=self.rest_hip.z-.012-.025*(1-smooth(t))-.135*compression
            lean=5*(1-smooth(t))+7*compression
        self.torso(height,lean=lean)
        left=self.feet['Left']+Vector((0,-.025*fold,lift))
        right=self.feet['Right']+Vector((0,.035*fold,lift*.85))
        self.legs(left,right)
        for side,sign in [('Left',1),('Right',-1)]:
            b=self.bone(side+'Arm')
            self.matrix(side+'Arm',Quaternion((0,1,0),sign*math.radians(8*fold))@b.matrix.to_quaternion(),b.head.copy())
        for b in self.bones:
            if b.name.startswith('cape_'):
                b.rotation_euler.x += math.radians(4*math.sin(t*math.pi))

    def combo(self, phase):
        # Ten landmarks: five flowing chamber positions alternating with contacts.
        hands=[(-.38,-.19,1.49),(-.10,-.50,1.15),(.27,-.30,.99),(.06,-.49,1.24),
               (-.34,-.23,1.48),(-.08,-.50,1.37),(.25,-.28,1.43),(.00,-.51,1.13),
               (-.40,-.24,1.03),(-.17,-.49,1.25)]
        blade=[(-.32,-.15,.94),(.42,-.87,-.25),(.93,-.16,-.22),(-.56,-.73,.39),
               (-.35,-.14,.93),(.40,-.91,.05),(.79,-.1,.61),(-.36,-.87,-.33),
               (-.82,-.23,.14),(.08,-.86,.5)]
        yaws=[(v,0,0) for v in [-18,13,23,-8,-22,15,24,-8,-22,-8]]
        yaw=periodic(yaws,phase*2).x
        rhythm=math.cos(phase*math.tau)
        height=self.rest_hip.z-.057-.015*(1-rhythm)
        self.torso(height,yaw=yaw,lean=3.+2*(1-rhythm))
        self.legs(yaw=yaw*.12)
        # Defensive free hand counterbalances the cut without a separate action.
        left=Vector((.32,-.22,1.15))
        self.limb('Left',True,left,Vector((.8,.15,1.05)))
        target=periodic(hands,phase*2)
        hand_head=self.limb('Right',True,target,Vector((-.9,.04,1.03)))
        hand=self.bone('RightHand')
        inherited=hand.matrix.to_quaternion()
        direction=periodic(blade,phase*2).normalized()
        align=(inherited@self.blade_axis).rotation_difference(direction)
        self.matrix('RightHand',align@inherited,hand_head)
        for b in self.bones:
            if b.name.startswith('cape_'):
                b.rotation_euler.x += math.radians(3*math.sin(phase*math.tau-.5))
                b.rotation_euler.y += math.radians(2*math.sin(phase*math.tau*.4))

    def capture(self):
        return [(b.rotation_quaternion.copy(), b.location.copy(), b.rotation_euler.copy()) for b in self.bones]

    def bake(self,name,rows):
        old=bpy.data.actions.get(name)
        if old: bpy.data.actions.remove(old,do_unlink=True)
        a=bpy.data.actions.new(name)
        a.use_fake_user=True
        a['source']='Varendor v3 authored motion on the accepted FK_Humanoid_Rig'
        self.rig.animation_data.action=a
        previous={}
        for frame,row in enumerate(rows):
            for b,(q,loc,euler) in zip(self.bones,row):
                if b.name.startswith('cape_'):
                    b.rotation_euler=euler;b.keyframe_insert('rotation_euler',frame=frame,group=b.name)
                else:
                    q=q.copy()
                    if b.name in previous and q.dot(previous[b.name])<0:q.negate()
                    previous[b.name]=q.copy()
                    b.rotation_quaternion=q;b.keyframe_insert('rotation_quaternion',frame=frame,group=b.name)
                if b.name=='mixamorig:Hips':
                    b.location=loc;b.keyframe_insert('location',frame=frame,group=b.name)
        for fc in a.fcurves:
            for key in fc.keyframe_points:key.interpolation='LINEAR'
        self.rig.animation_data.action=None
        return a


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--master',required=True)
    ap.add_argument('--out',required=True)
    ap.add_argument('--render',action='store_true')
    ap.add_argument('--no-export',action='store_true')
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    source=Path(args.master).resolve();out=Path(args.out).resolve();out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(source),use_scripts=False)
    scene=bpy.context.scene;scene.render.fps=FPS
    rig=bpy.data.objects['FK_Humanoid_Rig'];rig.location.z=0
    objects=list(bpy.data.collections['Forgotten_Knight_Fitted'].objects)
    before={a.name:action_digest(a) for a in bpy.data.actions if a.name not in CHANGED}
    author=Author(rig)
    for name,frames,fn in [('idle',90,author.idle),('idle_weapon',90,author.idle),
        ('jump_start',6,lambda t:author.jump('jump_start',t)),
        ('jump_air',30,lambda t:author.jump('jump_air',t)),
        ('jump_land',12,lambda t:author.jump('jump_land',t))]:
        rows=[]
        for f in range(frames+1):fn(f/frames);rows.append(author.capture())
        author.bake(name,rows)
    rows=[]
    for frame in range(151):
        author.combo(frame/FPS);rows.append(author.capture())
    master=author.bake('combo_flow_master',rows)
    master['contacts_frames']=[15,45,75,105,135]
    master['loop']=True
    for index in range(5):
        a=author.bake(f'combo_{index+1:02d}',rows[index*30:index*30+31])
        a['contact_phase']=.5;a['normalized_duration']=1.0;a['loop']=False
    for name,digest in before.items():
        assert action_digest(bpy.data.actions[name])==digest, 'Unrelated action changed: '+name
    rig.animation_data.action=bpy.data.actions['idle'];scene.frame_set(0)
    set_loadout(objects,[])
    scene.frame_start=0;scene.frame_end=90
    master_path=out/'Varendor_Knight_Motion_v3.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(master_path))
    report={'version':3,'blender':bpy.app.version_string,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
            'master_sha256':hashlib.sha256(master_path.read_bytes()).hexdigest(),'unchanged_actions':before,
            'changed_actions':sorted(CHANGED),'combo_master':'combo_flow_master','contacts_frames':[15,45,75,105,135],
            'runtime_contact_phase':.5,'server_timing_changed':False,'bones':len(rig.data.bones)}
    if args.render:
        from render_animation_review import configure
        configure(scene,8,600,760)
        scene.camera.data.type='ORTHO';scene.camera.data.ortho_scale=2.6
        scene.camera.location=(3,-6,2.4);scene.camera.rotation_euler=(Vector((0,0,1))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
        poses=[('idle',0,[]),('idle_weapon',20,FULL),('jump_land',3,[])]
        poses += [('combo_flow_master',f,FULL) for f in [0,15,30,45,60,75,90,105,120,135,150]]
        for name,frame,loadout in poses:
            set_loadout(objects,loadout);rig.animation_data.action=bpy.data.actions[name];scene.frame_set(frame)
            scene.render.filepath=str(out/f'{name}_{frame:03d}.png');bpy.ops.render.render(write_still=True)
    if not args.no_export:
        # The editable master keeps the complete choreography; runtime keeps the
        # existing 29 named slices so the equipment and skill contracts survive.
        rig.animation_data.action=None
        bpy.data.actions.remove(bpy.data.actions['combo_flow_master'],do_unlink=True)
        meshes=[o for o in objects if o.type=='MESH' and o.name!='FK_Base_Body']
        select_assets(meshes,rig)
        destination=out/'Knight_Modular.glb'
        bpy.ops.export_scene.gltf(filepath=str(destination),**export_options())
        doc,_=glb_read(destination);assert len(doc['animations'])==29
        assert len(doc['skins'])==1 and len(doc['skins'][0]['joints'])==56
        report['runtime_sha256']=hashlib.sha256(destination.read_bytes()).hexdigest()
    (out/'motion-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
    print('V3_MOTION_AUTHORED',json.dumps(report),flush=True)


if __name__=='__main__':main()
