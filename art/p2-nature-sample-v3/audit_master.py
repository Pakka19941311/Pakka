"""Read-only check of saved master and a disposable edit round-trip copy."""
from pathlib import Path
import bpy,json,hashlib
OUT=Path(__file__).resolve().parent;path=OUT/'Varendor_P2_Nature_Candidate_01.blend'
before=hashlib.sha256(path.read_bytes()).hexdigest();bpy.ops.wm.open_mainfile(filepath=str(path))
parents=[o for o in bpy.data.objects if o.get('stable_id')];unpacked=[im.name for im in bpy.data.images if im.source=='FILE' and im.users and not im.packed_file]
trees=[o for o in parents if o.name.startswith('P2N_tree_')];assert len(trees)==24;assert not unpacked
sample=next(o for o in parents if o.name.startswith('P2N_fern_'));name=sample.name;old=list(sample.location);sample.location.x+=.2
temp=OUT/'QA_EDIT_ROUNDTRIP.blend';bpy.ops.wm.save_as_mainfile(filepath=str(temp),compress=True);bpy.ops.wm.open_mainfile(filepath=str(temp));assert abs(bpy.data.objects[name].location.x-old[0]-.2)<.0001
assert hashlib.sha256(path.read_bytes()).hexdigest()==before
report={'masterSha256':before,'trees':len(trees),'editableParents':len(parents),'unpackedImages':unpacked,'editRoundTrip':{'object':name,'deltaX':.2,'pass':True,'productionMasterUnchanged':True},'largePackedImages':sorted([{'name':i.name,'bytes':len(i.packed_file.data)}for i in bpy.data.images if i.packed_file],key=lambda v:-v['bytes'])[:8]}
(OUT/'master-audit.json').write_text(json.dumps(report,indent=2)+'\n');temp.unlink();print('MASTER_AUDIT '+json.dumps({k:v for k,v in report.items()if k!='largePackedImages'}),flush=True)
