// Synthetic P0 comparison data only. No user database, browser profile or game files are opened for writing.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ITEMS, CLASSES, EQUIP_SLOTS } from '../src/data/game-data.ts';
import { INVENTORY_CAPACITY } from '../src/core/game-rules.ts';
import { itemReference, equipInventoryItem, unequipInventoryItem, resolveEquipmentSlot } from '../src/core/inventory-commands.ts';
import { itemStatBreakdown, calculateEquipmentStats } from '../src/core/equipment-stats.ts';
import { SCROLLS, ENHANCEMENT_PERCENT, enhanceItem, scrollChance } from '../src/core/enhancement-v2.ts';
import { quickDefaults, normalizeQuickbar } from '../src/controls/quickbar.ts';

assert.equal(INVENTORY_CAPACITY, 42);
assert.equal(EQUIP_SLOTS.length, 12);
assert.deepEqual(ENHANCEMENT_PERCENT, JSON.parse(readFileSync('docs/migration/v2/BASELINE.json','utf8')).enhancement_target_chances_percent);
let serial = 0;
const item = (id, plus=0, count=1) => {
  assert.ok(ITEMS[id], id);
  return {uid:`p0-ui-synthetic-${String(++serial).padStart(3,'0')}`, id, plus, count};
};
const candidateRing = item('ember_ring',3);
const enhancedWeapon = item('executioner',7);
const tooltipTarget = item('sovereign_seal',15);
const scrolls = Object.keys(SCROLLS).map(id => item(id,0,id==='weapon_scroll'?1:3));
const lastPotion = item('potion',0,1);
const equipment = {weapon:item('wardens_blade',3),chest:item('militia_plate',1),
  ring1:item('ember_ring',1),ring2:item('ember_ring',4)};
const inventory = [candidateRing,enhancedWeapon,tooltipTarget,...scrolls,lastPotion];
while (inventory.length < INVENTORY_CAPACITY) inventory.push(item('wardens_blade',0));
const fullBag = {classId:'knight',dead:false,inventory,equipment};
const before = structuredClone(fullBag);
const def = i => ITEMS[i.id];
const allItems = s => [...s.inventory,...Object.values(s.equipment).filter(Boolean)];
const uidSet = s => allItems(s).map(i=>i.uid).sort();
assert.equal(new Set(uidSet(fullBag)).size, allItems(fullBag).length);
assert.ok(allItems(fullBag).every(i=>i.count>0&&Number.isInteger(i.count)));

const automatic = equipInventoryItem(fullBag,itemReference(candidateRing),def);
assert.equal(automatic.ok,true); assert.equal(automatic.slot,'ring1');
assert.equal(automatic.inventory.length,42);
assert.deepEqual(uidSet(automatic),uidSet(fullBag));
assert.equal(automatic.inventory[0].uid,equipment.ring1.uid);
assert.equal(automatic.equipment.ring2.uid,equipment.ring2.uid);
const explicit = equipInventoryItem(fullBag,itemReference(candidateRing),def,'ring2');
assert.equal(explicit.ok,true); assert.equal(explicit.slot,'ring2');
assert.equal(explicit.equipment.ring1.uid,equipment.ring1.uid);
assert.deepEqual(uidSet(explicit),uidSet(fullBag));
const freeRing = structuredClone(fullBag);
freeRing.inventory.push(freeRing.equipment.ring2); delete freeRing.equipment.ring2;
// Remove one filler blade: still exactly 42 bag cells, with ring2 now free.
freeRing.inventory.splice(8,1);
assert.equal(resolveEquipmentSlot('ring',freeRing.equipment),'ring2');
const freeResult = equipInventoryItem(freeRing,itemReference(candidateRing),def);
assert.equal(freeResult.ok,true); assert.equal(freeResult.slot,'ring2');
assert.equal(freeResult.inventory.length,41); assert.deepEqual(uidSet(freeResult),uidSet(freeRing));
const noRoom = unequipInventoryItem(fullBag,itemReference(equipment.weapon),'weapon');
assert.deepEqual(noRoom,{ok:false,reason:'bag-full'});

const target = {...itemReference(enhancedWeapon),location:'bag'};
const lastScroll = scrolls.find(i=>i.id==='weapon_scroll');
const success = enhanceItem(fullBag,itemReference(lastScroll),target,def,0);
assert.equal(success.ok,true); assert.equal(success.success,true);
assert.equal(success.chance,0.17); assert.equal(success.to,8);
assert.equal(success.inventory.find(i=>i.uid===enhancedWeapon.uid).plus,8);
assert.ok(!success.inventory.some(i=>i.uid===lastScroll.uid));
assert.deepEqual(uidSet(success),uidSet(fullBag).filter(uid=>uid!==lastScroll.uid));
const failure = enhanceItem(fullBag,itemReference(lastScroll),target,def,0.999);
assert.equal(failure.ok,true); assert.equal(failure.success,false);
assert.ok(!uidSet(failure).includes(enhancedWeapon.uid));
assert.deepEqual(uidSet(failure),uidSet(fullBag).filter(uid=>![lastScroll.uid,enhancedWeapon.uid].includes(uid)));
const wrongScroll = scrolls.find(i=>i.id==='armor_scroll');
assert.equal(enhanceItem(fullBag,itemReference(wrongScroll),target,def,0).ok,false);
assert.deepEqual(fullBag,before,'Reference fixtures must not be mutated by preview commands');

const quickbar = quickDefaults();
assert.equal(quickbar.length,32);
assert.deepEqual(normalizeQuickbar(JSON.parse(JSON.stringify(quickbar))),quickbar);
const tooltip = itemStatBreakdown(ITEMS[tooltipTarget.id],tooltipTarget.plus);
for (const key of Object.keys(tooltip.total)) assert.equal(tooltip.base[key]+tooltip.bonus[key],tooltip.total[key]);
const result = {
  kind:'P0 synthetic UI comparison fixtures; NOT personal save or measured screenshot',
  sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  purpose:'P0-03.4 items and expected command/tooltip results for later paired UI screenshots',
  noRuntimeImportEndpoint:true, personalDataRead:false, browserProfileExported:false, screenshotCaptured:false,
  base:{characterLabel:'P0 synthetic knight',level:1,state:fullBag,
    combat:calculateEquipmentStats('knight',CLASSES.knight.stats,1,equipment,def)},
  references:{candidateRingUid:candidateRing.uid,enhancedWeaponUid:enhancedWeapon.uid,
    tooltipItemUid:tooltipTarget.uid,lastPotionUid:lastPotion.uid,lastScrollUid:lastScroll.uid,
    equipmentSlotOrder:EQUIP_SLOTS,fullBagCells:42,scrolls:scrolls.map(s=>({uid:s.uid,id:s.id,count:s.count,
      weaponPlus7Chance:scrollChance(s.id,'weapon',7),armorPlus1Chance:scrollChance(s.id,'chest',1)}))},
  uiProfiles:[{quickRows:2,quickbar},{quickRows:4,quickbar}],
  tooltip:{item:tooltipTarget,definition:ITEMS[tooltipTarget.id],breakdown:tooltip},
  outcomes:{automaticRing:{slot:automatic.slot,replacedUid:automatic.replaced.uid,bagCount:42},
    explicitRing:{slot:explicit.slot,replacedUid:explicit.replaced.uid,bagCount:42},
    freeRing:{input:freeRing,slot:freeResult.slot,bagCount:41},
    unequipFullBag:noRoom,
    lastScrollSuccess:{forcedSyntheticRoll:0,chance:success.chance,to:success.to,state:{classId:'knight',dead:false,inventory:success.inventory,equipment:success.equipment}},
    lastScrollFailure:{forcedSyntheticRoll:0.999,chance:failure.chance,to:failure.to,state:{classId:'knight',dead:false,inventory:failure.inventory,equipment:failure.equipment}}},
  checks:{knownItemDefinitions:true,uniqueSyntheticUids:true,fullBagSwapPreservesUids:true,
    pairedSlotResolver:true,fullBagUnequipRejected:true,lastScrollConsumedOnceInEachIndependentFixture:true,
    enhancementSuccessRetainsTargetUid:true,enhancementFailureRemovesOnlyTargetAndConsumedScroll:true,
    referenceInputUnchanged:true,quickbar32Roundtrip:true,tooltipBasePlusBonusEqualsTotal:true,all60ChancesUnchanged:true},
  limitations:['Forced rolls describe separate synthetic examples, not odds measurements or player attempts.',
    'No browser interaction, personal profile, window coordinates, UI scale or frame-time measurement.',
    'No actual pending command or receipt is created; server idempotency remains covered by the separate P0 backup/shutdown checks.']
};
const file='docs/migration/p0/evidence/ui-reference-fixtures.json';
writeFileSync(file,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),checks:result.checks},null,2));
