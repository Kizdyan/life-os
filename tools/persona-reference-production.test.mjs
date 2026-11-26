import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReferenceProductionGuide} from './persona-reference-production.mjs';
const record=(n,medianShotSec=2.1)=>({assetSha256:n.repeat(64),evidenceSha256:'e'.repeat(64),preference:'unconfirmed',description:'кинематографическая история театр свет',technical:{durationSec:20},montage:{status:'HEURISTIC',medianShotSec,candidateCuts:[1,4,7]},color:{measurement:{luma:{median:100}}}});
test('reference pacing is bounded, relevant and requires distinct sources',()=>{
 const records=[record('a'),record('b',2.5),{...record('c'),description:'другая тематика'}];
 const guide=buildReferenceProductionGuide({format:'cinematic',query:'театр',records});
 assert.equal(guide.status,'REFERENCE_GUIDANCE');assert.equal(guide.shotSec,2.6);assert.equal(guide.referenceLumaMedian,100);
 assert.equal(guide.references.length,2);assert.equal(guide.preference,'unconfirmed');
 for(const format of ['auto','acting','dialogue','music','explainer','voiceover'])assert.equal(buildReferenceProductionGuide({format,query:'театр',records}).status,'ABSTAIN');
 assert.equal(buildReferenceProductionGuide({format:'cinematic',query:'театр',records:[record('a'),record('a')]}).status,'ABSTAIN');
 assert.equal(buildReferenceProductionGuide({format:'cinematic',query:'неизвестный',records}).status,'ABSTAIN');
});
