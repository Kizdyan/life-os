import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectAccents, proposeCuts } from './persona-audio-cuts.mjs';

test('accent detection responds to irregular transient pulses, not a fixed beat grid', () => {
  const sr = 11025, samples = new Float32Array(sr * 6);
  for (const t of [0.7, 1.63, 3.15, 4.7]) {
    const start = Math.floor(t * sr);
    for (let j=0;j<800;j++) samples[start+j] += 0.75 * Math.exp(-j/180) * Math.sin(2*Math.PI*440*j/sr);
  }
  const accents = detectAccents(samples,sr);
  for (const t of [0.7,1.63,3.15,4.7])
    assert.ok(accents.some(a=>Math.abs(a.timeSec-t)<0.12), 'Missing transient near '+t+': '+JSON.stringify(accents));
});

test('cut suggestions preserve irregular musical timing and do not force empty beats', () => {
  const accents = [
    {timeSec:0.8,strength:0.5},
    {timeSec:1.9,strength:0.9},
    {timeSec:3.7,strength:0.8},
    {timeSec:5.1,strength:0.7}
  ];
  const cuts=proposeCuts(accents,6,{minShotSec:0.5,maxShotSec:2.4});
  assert.deepEqual(cuts.map(c=>c.timeSec),[1.9,3.7]);
  assert.ok(cuts.every(c=>c.reason==='audio-accent'));
});

test('silent soundtrack yields no fake accents or cuts',()=>{
  assert.deepEqual(detectAccents(new Float32Array(11025*2)),[]);
  assert.deepEqual(proposeCuts([],10),[]);
});
