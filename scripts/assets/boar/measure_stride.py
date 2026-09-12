import bpy,pathlib,json,statistics,sys
import argparse
args_parser=argparse.ArgumentParser()
args_parser.add_argument('--intake',required=True)
args_parser.add_argument('--output',required=True)
args_parser.add_argument('--reports',required=True)
args_parser.add_argument('--repo',required=True)
args=args_parser.parse_args(sys.argv[sys.argv.index('--')+1:])
root=pathlib.Path(args.reports)
bpy.ops.wm.open_mainfile(filepath=str(root/'candidate.blend'),load_ui=False,use_scripts=False)
arm=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
report={}
for name in ['walk','run']:
 action=bpy.data.actions[name];arm.animation_data.action=action
 frames=[];end=action.frame_range[1]
 for i in range(241):
  frame=end*i/240;bpy.context.scene.frame_set(int(frame),subframe=frame-int(frame));bpy.context.view_layer.update()
  frames.append({b:list(arm.matrix_world@arm.pose.bones[b].head) for b in ['ContactFrontL','ContactFrontR','ContactBackL','ContactBackR']})
 velocities=[];per={}
 for bone in frames[0]:
  zs=[f[bone][2] for f in frames];floor=min(zs);values=[]
  for i in range(240):
   if max(zs[i:i+2])<floor+.012:
    v=(frames[i][bone][1]-frames[i+1][bone][1])/(end/60/240)
    if v>.01:values.append(v);velocities.append(v)
  per[bone]={'floor':floor,'max_height':max(zs),'stance_samples':len(values),'median':statistics.median(values) if values else None,'min_speed':min(values) if values else None,'max_speed':max(values) if values else None}
 report[name]={'median':statistics.median(velocities) if velocities else None,'per_foot':per,'all_frames':frames,'duration':end/60,'method':'241 phases, original source anatomical contact markers, within 12mm of each marker minimum height; backward world Y motion; no runtime root translation'}
(root/'tip-stride.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:{x:y for x,y in v.items() if x!='all_frames'} for k,v in report.items()},indent=2))
