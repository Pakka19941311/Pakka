import test from 'node:test';
import assert from 'node:assert/strict';
import {quickDefaults, normalizeQuickbar, quickKey} from '../src/controls/quickbar.ts';
test('old saves receive 32 slots and retain original four skill keys', () => {
 const slots = normalizeQuickbar(undefined); assert.equal(slots.length,32);
 assert.deepEqual(slots.slice(0,4).map(s=>s.key), ['Digit1','Digit2','Digit3','Digit4']);
 assert.equal(slots[8].action,'potion');
});
test('saved empty assignment and duplicate action survive, conflicting keys do not', () => {
 const slots = quickDefaults(); slots[0]={action:'',key:''}; slots[25]={action:'potion',key:'Digit2'};
 const clean=normalizeQuickbar(slots); assert.deepEqual(clean[0], slots[0]); assert.equal(clean[25].action,'potion'); assert.equal(clean[25].key,'');
});
test('invalid action and browser shortcuts never become a binding', () => {
 const slots = quickDefaults(); slots[0]={action:'skill:99',key:'Alt+F4'};
 assert.deepEqual(normalizeQuickbar(slots)[0], quickDefaults()[0]);
 assert.equal(quickKey({code:'Digit1',shiftKey:true,ctrlKey:false,altKey:false,metaKey:false}),'Shift+Digit1');
 assert.equal(quickKey({code:'Digit1',shiftKey:false,ctrlKey:true,altKey:false,metaKey:false}),'');
});
