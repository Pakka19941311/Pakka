import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {createHash} from 'node:crypto';

function child(root,name){
  if(typeof name!=='string'||!name||isAbsolute(name))throw Error('invalid-art-pack-path');
  const result=resolve(root,name),path=relative(root,result);
  if(!path||path.startsWith('..')||isAbsolute(path))throw Error('art-pack-path-escapes-root');
  return result;
}

/** The manifest also keeps historical adaptations; ship the current profile art only. */
export function selectProfileArtPacks(manifest,profiles){
  if(manifest.schema_version!==1||!Array.isArray(manifest.packs))throw Error('invalid-art-pack-manifest');
  const active=Object.values(profiles);
  const sourceFor=profile=>'godot-pc/'+profile.asset_path.replace(/^res:\/\//,'');
  const matches=(pack,profile)=>pack.files.some(file=>file.source===sourceFor(profile));
  for(const profile of active.filter(profile=>profile.license?.startsWith('CC-BY-SA-'))){
    const packs=manifest.packs.filter(pack=>matches(pack,profile));
    if(packs.length!==1||packs[0].license!==profile.license)throw Error('missing-canonical-sharealike-pack:'+profile.mob_id);
  }
  return {...manifest,packs:manifest.packs.filter(pack=>active.some(profile=>matches(pack,profile)))};
}

const COMMON_CREDITS=[
  'art/knight-v2/LICENSES.md','art/forgotten-knight/LICENSES.md','art/cloaks-v3/CREDITS.md',
  'docs/assets/world-source-manifest.json','art/world-final/nature-source/pine-wood/source.json',
  'art/world-final/materials/snow_02/source.json','art/world-final/materials/rock_wall_02/source.json',
  'godot-pc/world-expansion-v3/actors/CREDITS.md',
].map(source=>({source,destination:'licenses/'+source}));
const P2_CREDITS=[
  ...['CREDITS.md','licenses/CC0-1.0.txt','motion/CREDITS.md'].map(file=>({
    source:'godot-pc/world-expansion-v3/city/'+file,destination:'licenses/city/'+file})),
  {source:'art/p2-nature-sample-v3/CREDITS.md',destination:'licenses/nature/CREDITS.md'},
  {source:'art/terrain-lake-p2-v3/CREDITS.md',destination:'licenses/terrain-lake/CREDITS.md'},
  {source:'godot-pc/world-expansion-v3/city/licenses/CC0-1.0.txt',destination:'licenses/nature/CC0-1.0.txt'},
];

export function stageGameplayCredits(root,destination,{p2=false}={}){
  root=resolve(root);destination=resolve(destination);
  // Read every notice first, so a missing credit fails before copying this set.
  const entries=[...COMMON_CREDITS,...(p2?P2_CREDITS:[])].map(file=>({
    target:child(destination,file.destination),bytes:readFileSync(child(root,file.source))}));
  for(const {target,bytes} of entries){mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});}
  return {files:entries.length};
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
