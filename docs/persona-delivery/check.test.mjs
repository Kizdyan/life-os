import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { validateDelivery } from './check.mjs';

const brief=JSON.parse(readFileSync(new URL('./editorial-candidate-production-brief.json',import.meta.url),'utf8'));
const shootingPack=readFileSync(new URL('./first-real-reel-shooting-pack.md',import.meta.url),'utf8');
const sources=JSON.parse(readFileSync(new URL('./seven-shot-sources.template.json',import.meta.url),'utf8'));

test('validates the selected editorial candidate rather than the archived V1 README',()=>{
 assert.doesNotThrow(()=>validateDelivery({brief,shootingPack,sources}));
 const stale={...brief,script:brief.script.map((beat,index)=>index===4?{...beat,line:'То есть спать мы не будем?'}:beat)};
 assert.throws(()=>validateDelivery({brief:stale,shootingPack,sources}),/candidate beat 5/i);
});
