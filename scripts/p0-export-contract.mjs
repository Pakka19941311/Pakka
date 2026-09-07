// Reproducible source-derived baseline; never reads browser settings or a player database.
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { CLASSES, ITEMS, MONSTERS, EQUIP_SLOTS } from '../src/data/game-data.ts';
import { ENHANCEMENT_PERCENT, SCROLLS } from '../src/core/enhancement-v2.ts';
import { ITEM_PROGRESSION } from '../src/core/item-progression.ts';
import { quickDefaults } from '../src/controls/quickbar.ts';
const base=JSON.parse(readFileSync('docs/migration/v2/BASELINE.json','utf8'));
assert.deepEqual(ENHANCEMENT_PERCENT,base.enhancement_target_chances_percent);
const report={sourceCommit:base.head,classes:CLASSES,items:ITEMS,monsters:MONSTERS,equipmentSlots:EQUIP_SLOTS,
  enhancementChances:ENHANCEMENT_PERCENT,progression:ITEM_PROGRESSION,scrolls:SCROLLS,quickbarDefaults:quickDefaults(),
  checks:{all60Chances:true,classes:Object.keys(CLASSES).length,skills:Object.values(CLASSES).reduce((n,c)=>n+c.skills.length,0),
    items:Object.keys(ITEMS).length,monsterTypes:Object.keys(MONSTERS).length,equipmentSlots:EQUIP_SLOTS.length,quickAssignments:quickDefaults().length},
  personalProfileExported:false};
writeFileSync('docs/migration/p0/evidence/gameplay-contract.json',JSON.stringify(report,null,2));
console.log(report.checks);
