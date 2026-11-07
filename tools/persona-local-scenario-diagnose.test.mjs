import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {diagnosePersonaLocalRawResponse,diagnosePersonaLocalRawFile} from './persona-local-scenario-diagnose.mjs';
const beats=[
 {framing:'close-up',durationSec:3},{framing:'medium',durationSec:4},
 {framing:'detail',durationSec:5},{framing:'средний план',durationSec:'6 секунд'}
];
test('explains valid but still unapproved canonical conversion without making a screenplay',()=>{
 const report=diagnosePersonaLocalRawResponse(JSON.stringify({review:{},beats}));
 assert.equal(report.status,'FRAME_METADATA_NORMALIZED');
 assert.equal(report.frameCount,4);
 assert.deepEqual(report.corrections.map(x=>x.field),['durationSec','framing']);
 assert.match(report.warning,/НЕ валидированы/);
 assert.equal(report.brief,undefined);
});
test('identifies missing framing on fourth frame',()=>{
 const copy=structuredClone(beats);delete copy[3].framing;
 const report=diagnosePersonaLocalRawResponse(JSON.stringify({beats:copy}));
 assert.equal(report.status,'REJECTED_FRAME_METADATA');
 assert.equal(report.diagnostic.frameNumber,4);
 assert.equal(report.diagnostic.field,'framing');
});
test('rejects malformed JSON without pretending it is a generated screenplay',()=>{
 const report=diagnosePersonaLocalRawResponse('not even JSON');
 assert.equal(report.status,'REJECTED_INVALID_JSON');
 assert.equal(report.corrections.length,0);
});
test('diagnoses saved local raw with exact source bytes and never overwrites',async(t)=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-local-raw-diagnose-'));
 t.after(()=>rm(dir,{recursive:true,force:true}));
 const source=join(dir,'raw.txt'),out=join(dir,'diagnostic.json'),original=JSON.stringify({beats});
 await writeFile(source,original);
 const result=await diagnosePersonaLocalRawFile(source,{outPath:out});
 assert.equal(result.status,'FRAME_METADATA_NORMALIZED');
 assert.equal(await readFile(source,'utf8'),original);
 assert.equal(JSON.parse(await readFile(out,'utf8')).frameCount,4);
 await assert.rejects(diagnosePersonaLocalRawFile(source,{outPath:out}),/EEXIST/);
 await assert.rejects(diagnosePersonaLocalRawFile(source,{outPath:source}),/перезаписать/);
});
