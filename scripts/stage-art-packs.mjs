import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';

function child(root,name){
  if(typeof name!=='string'||!name||isAbsolute(name))throw Error('invalid-art-pack-path');
  const result=resolve(root,name),path=relative(root,result);
  if(!path||path.startsWith('..')||isAbsolute(path))throw Error('art-pack-path-escapes-root');
  return result;
}

/** Keep licensed adaptations accessible beside the PCK, with exact provenance.
 * Validate the complete input set before writing any of its files. */
export function stageArtPacks(root,destination,manifest){
  root=resolve(root);destination=resolve(destination);
  if(manifest.schema_version!==1||!Array.isArray(manifest.packs))throw Error('invalid-art-pack-manifest');
  const entries=[],targets=new Set();
  for(const pack of manifest.packs){
    if(!pack.license||!pack.source_url||!Array.isArray(pack.files)||!pack.files.length)throw Error('incomplete-art-pack');
    const folder=child(destination,pack.destination_directory);
    for(const file of pack.files){
      const source=child(root,file.source),target=child(folder,file.destination);
      if(targets.has(target.toLowerCase()))throw Error('duplicate-art-pack-target');
      targets.add(target.toLowerCase());
      const bytes=readFileSync(source),sha256=createHash('sha256').update(bytes).digest('hex');
      if(bytes.length!==file.bytes||sha256!==file.sha256)throw Error('art-pack-content-differs:'+file.source);
      entries.push({target,bytes});
    }
  }
  for(const {target,bytes} of entries){mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});}
  const receipt=resolve(destination,'licenses/standalone-art-packs.json');
  mkdirSync(dirname(receipt),{recursive:true});writeFileSync(receipt,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return {packs:manifest.packs.length,files:entries.length,bytes:entries.reduce((sum,e)=>sum+e.bytes.length,0)};
}
