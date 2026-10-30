import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizePersonaLocalScenarioBeats,PersonaLocalFrameValidationError} from './persona-local-scenario-output.mjs';

const frames=()=>[
 {line:'Начало.',action:'Герой приоткрывает дверь.',framing:'close-up',durationSec:3},
 {line:'Развитие.',action:'Делает второй шаг.',framing:'medium',durationSec:4},
 {line:'Поворот.',action:'Замирает и смотрит назад.',framing:'detail',durationSec:6},
 {line:'Финал.',action:'Возвращается в комнату.',framing:'close-up',durationSec:5}
];
test('accepts exact canonical values without touching words or actor actions',()=>{
 const source=frames(),result=normalizePersonaLocalScenarioBeats(source);
 assert.equal(result.corrections.length,0);assert.deepEqual(result.beats,source);
 assert.notEqual(result.beats[0],source[0]);
});
test('converts only unambiguous Russian/English framing synonyms and exact numeric units',()=>{
 const input=frames();input[0].framing='крупный план';input[1].framing=' medium shot ';
 input[2].framing='деталь';input[3].durationSec='4 секунды';
 const result=normalizePersonaLocalScenarioBeats(input);
 assert.deepEqual(result.beats.map(b=>b.framing),['close-up','medium','detail','close-up']);
 assert.deepEqual(result.beats.map(b=>b.durationSec),[3,4,6,4]);
 assert.equal(result.corrections.length,4);
 assert.equal(result.beats[3].line,'Финал.');
 assert.equal(result.beats[3].action,'Возвращается в комнату.');
 assert.equal(input[3].durationSec,'4 секунды');
});
test('preserves exact decimal duration, never estimates seconds from text length',()=>{
 const input=frames();input[0].durationSec='3,5 сек';input[1].durationSec='4.25 sec';
 const out=normalizePersonaLocalScenarioBeats(input);
 assert.equal(out.beats[0].durationSec,3.5);assert.equal(out.beats[1].durationSec,4.25);
});
test('identifies a missing fourth-frame field by its exact name',()=>{
 const input=frames();delete input[3].framing;
 assert.throws(()=>normalizePersonaLocalScenarioBeats(input),e=>{
  assert.ok(e instanceof PersonaLocalFrameValidationError);
  assert.equal(e.diagnostic.frameNumber,4);
  assert.equal(e.diagnostic.field,'framing');
  assert.equal(e.diagnostic.actualType,'undefined');
  assert.match(e.message,/Некорректный кадр 4: framing/);
  return true;
 });
});
test('refuses unsupported camera plans rather than inventing an incompatible framing',()=>{
 const input=frames();input[3].framing='общий план';
 assert.throws(()=>normalizePersonaLocalScenarioBeats(input),e=>{
  assert.equal(e.diagnostic.field,'framing');
  assert.equal(e.diagnostic.valuePreview,'"общий план"');
  return true;
 });
});
test('rejects zero, out-of-range, intervals and vague duration without inventing timing',()=>{
 for(const bad of [0,11,-1,'0','15 сек','3-5 сек','около пяти секунд',null]){
  const input=frames();input[3].durationSec=bad;
  assert.throws(()=>normalizePersonaLocalScenarioBeats(input),e=>
   e instanceof PersonaLocalFrameValidationError && e.diagnostic.field==='durationSec');
 }
});
test('rejects missing or non-object frames, and beat count outside contract',()=>{
 assert.throws(()=>normalizePersonaLocalScenarioBeats(frames().slice(0,2)),/3 до 12/);
 const input=frames();input[3]=null;
 assert.throws(()=>normalizePersonaLocalScenarioBeats(input),e=>
  e instanceof PersonaLocalFrameValidationError && e.diagnostic.field==='beat');
});
test('does not mutate reference data, script lines, artistic actions or unknown metadata',()=>{
 const input=frames();input[3].framing='CU';input[3].metadata={reference:'original',notes:['pause']};
 const before=structuredClone(input);
 const out=normalizePersonaLocalScenarioBeats(input);
 assert.equal(out.beats[3].framing,'close-up');
 assert.deepEqual(out.beats[3].metadata,before[3].metadata);
 assert.deepEqual(input,before);
});
