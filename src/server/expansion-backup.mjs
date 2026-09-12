import {DatabaseSync} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {MAX_LEVEL,xpNeeded} from '../core/game-rules.ts';
import {ACCESSORY_MIGRATION_VERSION} from '../data/accessories-v3.ts';
import {backupWorld} from '../../scripts/p0-backup-world.mjs';
import {obsoleteFinalPopulation} from '../world/legacy-final-population-repair.ts';

/** This inspection happens before WorldStore or simulation migrations open the
 * existing save for writing. A failed verified backup aborts the launcher. */
export async function backupBeforeExpansion(database,backups,populationPlan,backup=backupWorld){
 if(!existsSync(database))return null;
 const db=new DatabaseSync(database,{readOnly:true});let state;
 try{
  const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='world'").get();
  if(!table)return null;
  const row=db.prepare('SELECT state FROM world WHERE id=1').get();
  if(!row)return null;
  state=JSON.parse(row.state);
 }finally{db.close();}
 const heroes=Object.values(state.characters??{});if(!heroes.length)return null;
 const reasons=[];
 if(populationPlan?.slots&&obsoleteFinalPopulation(state.monsters??[],populationPlan.slots).length)reasons.push('legacy-final-population-repair');
 if(heroes.some(p=>p.accessoryMigrationVersion!==ACCESSORY_MIGRATION_VERSION))reasons.push('accessories-v3');
 if(heroes.some(p=>p.level>MAX_LEVEL||p.level===MAX_LEVEL&&p.xp>=xpNeeded(MAX_LEVEL)))reasons.push('level-cap-90');
 if(heroes.some(p=>p.starterProgress?.version!==1))reasons.push('starter-quests-v3');
 if(heroes.some(p=>p.progressionQuests?.version!==1))reasons.push('progression-quests-v3');
 if(populationPlan?.mode==='starter-v3'&&(state.starterPopulationVersion!==populationPlan.version||state.starterPopulationDigest!==populationPlan.digest))reasons.push('starter-population-v3');
 if(populationPlan?.mode==='starter-v3'&&populationPlan.mapVersion&&state.mapVersion!==populationPlan.mapVersion)reasons.push('world-geometry-v3');
 if(!reasons.length)return null;
 const result=await backup(database,backups);
 if(!result?.report?.allTablesAndStateFieldsEqual||result.report.integrity!=='ok'||!existsSync(result.filename))throw Error('expansion-backup-not-verified');
 return {reasons,filename:result.filename,report:result.report};
}
