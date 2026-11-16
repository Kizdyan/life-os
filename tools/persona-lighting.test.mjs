import assert from 'node:assert/strict';
import {test} from 'node:test';
import {personaLightingPlan} from '../packages/core/src/persona-lighting.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const ideas=JSON.parse(await readFile(new URL('../packages/core/src/persona-architect-ten-reels.json',import.meta.url),'utf8'));

test('lighting planner: shared contract selects piano when actor sits behind grand piano',()=>{
 const plan=personaLightingPlan('Актёр за пианино');
 assert.equal(plan.preset,'piano');
 assert.equal(plan.style,'Quiet Luxury');
 assert.match(plan.key,/45°/);
 assert.match(plan.fill,/отражатель/);
 assert.match(plan.back,/позади/);
 assert.equal(plan.source,'rules-v1');
 assert.match(personaLightingPlan(ideas[0].mainShots.split('.')[0]).key,/лицо, и руки/);
 assert.equal(personaLightingPlan('Человек открывает дверь').preset,'general');
 assert.throws(()=>personaLightingPlan(''),/Scene description/);
});

test('Python and browser produce identical Reel-01 advice from shared contract',()=>{
 const description='Актёр за пианино';
 const python=process.env.PERSONA_PYTHON||'python';
 const output=execFileSync(python,['tools/lighting_planner.py','--scene',description,'--json'],
  {encoding:'utf8',timeout:10000});
 assert.deepEqual(personaLightingPlan(description),JSON.parse(output));
});
