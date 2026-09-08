import {cpSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {WorldStore} from '../../server/world-store.mjs';
import {WorldSimulation} from '../../src/server/world-simulation.ts';
import {restoreWorldTopology} from '../../src/world/world-topology.ts';
const dest=resolve(process.argv[2]);mkdirSync(join(dest,'scripts'),{recursive:true});
cpSync('godot-pc/scripts/input_transport.gd',join(dest,'scripts/input_transport.gd'));
// Re-running after the fix must still compare with the released byte loop.
writeFileSync(join(dest,'scripts/network.gd'),execFileSync('git',['show','629cdef571c81473725acc88afe59385e2fcd518:godot-pc/scripts/network.gd']));
for(const name of ['fast_sse_candidate.gd','sse_benchmark.gd'])cpSync('scripts/pacing/'+name,join(dest,name));
writeFileSync(join(dest,'project.godot'),'config_version=5\n[application]\nconfig/name="Varendor isolated frame CPU measurement"\n[rendering]\nrenderer/rendering_method="gl_compatibility"\n');
const topology=restoreWorldTopology(JSON.parse(readFileSync('public/assets/world/world-topology.json','utf8')));
const store=new WorldStore(':memory:');const sim=new WorldSimulation({store,...topology,now:Date.now(),identifier:()=>crypto.randomUUID(),beta:true});
const p=sim.createCharacter('Pacing fixture','ranger');p.x=88;p.z=70;p.activeUntil=sim.state.time+60000;
writeFileSync(join(dest,'fixture.json'),JSON.stringify(sim.snapshot(p.id)));store.close();
