"""Bounded preservation/asset validation, independent of the game."""
import bpy,sys,json,hashlib,argparse
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from build_knight_v2 import action_digest

def mesh_digest(o):
 return hashlib.sha256(json.dumps({'vertices':[list(v.co) for v in o.data.vertices],'faces':[list(p.vertices) for p in o.data.polygons],'uv':[[list(x.uv) for x in l.data] for l in o.data.uv_layers],'weights':[{o.vertex_groups[g.group].name:g.weight for g in v.groups} for v in o.data.vertices]}).encode()).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--accepted',required=True);p.add_argument('--master',required=True);p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);bpy.ops.wm.open_mainfile(filepath=a.accepted,use_scripts=False)
 meshes={o.name:mesh_digest(o) for o in bpy.data.collections['Forgotten_Knight_Fitted'].objects if o.type=='MESH' and o.name!='FK_Base_Body'};actions={x.name:action_digest(x) for x in bpy.data.actions}
 bpy.ops.wm.open_mainfile(filepath=a.master,use_scripts=False)
 same_meshes={n:mesh_digest(bpy.data.objects[n])==h for n,h in meshes.items()};same_actions={n:action_digest(bpy.data.actions[n])==h for n,h in actions.items()}
 report={'accepted_armor_geometry_uv_weights_unchanged':same_meshes,'accepted_animation_channels_unchanged':same_actions,'packed_images':sum(bool(x.packed_file) for x in bpy.data.images),'all_images_packed':all(x.packed_file is not None for x in bpy.data.images if x.type=='IMAGE'),'default_visible':[o.name for o in bpy.data.collections['Forgotten_Knight_Fitted'].objects if o.type=='MESH' and not o.hide_render],'animations':list(bpy.data.actions.keys()),'armature_bones':len(bpy.data.objects['FK_Humanoid_Rig'].data.bones)}
 assert all(same_meshes.values()) and all(same_actions.values());assert report['all_images_packed'];assert report['armature_bones']==56;assert len(report['animations'])==29
 Path(a.out).write_text(json.dumps(report,indent=2));print('ASSET_AUDIT_PASS',json.dumps(report),flush=True)
if __name__=='__main__':main()
