import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
const packages=JSON.parse(readFileSync('package-lock.json','utf8')).packages;
const versions={};
for(const [path,value] of Object.entries(packages)){
  if(!path||!value.version)continue;
  const name=path.slice(path.lastIndexOf('node_modules/')+13);
  (versions[name]??=[]).push(value.version);
}
const response=await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(versions),signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Registry audit failed: ${response.status}`);
const advisories=await response.json();
const output=process.argv[2]??'work/qa/dependency-advisories.json';
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({checkedAt:new Date().toISOString(),registry:'https://registry.npmjs.org',versions,advisories},null,2));
console.log(JSON.stringify({packages:Object.keys(versions).length,advisories},null,2));
