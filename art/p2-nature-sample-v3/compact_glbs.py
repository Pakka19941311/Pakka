"""Deduplicate original image bytes across the explicit candidate GLB list."""
from pathlib import Path
import json,struct,hashlib
OUT=Path(__file__).resolve().parent;ROOT=OUT.parents[1];DEST=ROOT/'godot-pc/world-final/nature/p2-sample-v3'
def digest(data):return hashlib.sha256(data).hexdigest()
def compact(path):
 data=path.read_bytes();length,kind=struct.unpack_from('<II',data,12);doc=json.loads(data[20:20+length]);binary=data[28+length:];views=doc.get('bufferViews',[]);image_views=set();textures={}
 for image in doc.get('images',[]):
  if 'bufferView' not in image:continue
  index=image.pop('bufferView');image_views.add(index);view=views[index];blob=binary[view.get('byteOffset',0):view.get('byteOffset',0)+view['byteLength']];ext='.jpg' if image.pop('mimeType')=='image/jpeg' else '.png';sha=digest(blob);relative='textures/'+sha+ext;target=DEST/relative;target.parent.mkdir(exist_ok=True)
  if target.exists():assert target.read_bytes()==blob
  else:target.write_bytes(blob)
  image['uri']=relative;textures[relative]={'bytes':len(blob),'sha256':sha}
 newviews=[];newbinary=bytearray();remap={}
 for i,view in enumerate(views):
  if i in image_views:continue
  while len(newbinary)%4:newbinary.append(0)
  old=view.get('byteOffset',0);remap[i]=len(newviews);nextview=dict(view,byteOffset=len(newbinary));newbinary.extend(binary[old:old+view['byteLength']]);newviews.append(nextview)
 for accessor in doc.get('accessors',[]):
  if 'bufferView' in accessor:accessor['bufferView']=remap[accessor['bufferView']]
  if 'sparse' in accessor:
   for field in ['indices','values']:accessor['sparse'][field]['bufferView']=remap[accessor['sparse'][field]['bufferView']]
 while len(newbinary)%4:newbinary.append(0)
 doc['bufferViews']=newviews;doc['buffers']=[{'byteLength':len(newbinary)}];raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
 result=struct.pack('<III',0x46546c67,2,28+len(raw)+len(newbinary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(newbinary),0x004e4942)+newbinary;path.write_bytes(result)
 return {'bytes':len(result),'sha256':digest(result)},textures
manifest=json.loads((DEST/'manifest.json').read_text());textures={};before=sum(v['bytes']for v in manifest['chunks'])
for entry in manifest['chunks']:
 result,images=compact(DEST/entry['path']);entry.update(result);textures.update(images)
manifest['sharedOriginalImages']=textures;manifest['glbImagesExternal']=True
(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n');candidate=json.loads((OUT/'candidate-placements.json').read_text());candidate['runtimeExports']=manifest['chunks'];(OUT/'candidate-placements.json').write_text(json.dumps(candidate,indent=2)+'\n')
print('GLB_SHARED_TEXTURES '+json.dumps({'beforeBytes':before,'glbBytes':sum(v['bytes']for v in manifest['chunks']),'sharedImageBytes':sum(v['bytes']for v in textures.values()),'sharedImages':len(textures)}),flush=True)
