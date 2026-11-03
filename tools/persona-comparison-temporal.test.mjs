import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compareTemporalLuma} from './persona-comparison-temporal.mjs';

const series=(values,shift=0)=>values.map((y,i)=>({atSec:i/12+shift,y}));

test('source and constant grade do not create temporal candidates',()=>{
 const source=series(Array(24).fill(100));
 const stable=series(Array(24).fill(104));
 const report=compareTemporalLuma(source,stable);
 assert.equal(report.status,'measured');
 assert.equal(report.alignedSamples,24);
 assert.equal(report.coverage,1);
 assert.deepEqual(report.candidates,[]);
});

test('detects alternating graded exposure when the original is stable',()=>{
 const source=series(Array(24).fill(100));
 const flicker=series(Array.from({length:24},(_,i)=>i%2===0?105:128));
 const report=compareTemporalLuma(source,flicker);
 assert.equal(report.status,'measured');
 assert.ok(report.candidates.length>0);
 assert.ok(report.candidates[0].amplitude>=20);
 assert.ok(report.candidates[0].events>2);
});

test('source flicker and scene cut do not masquerade as new grade flicker',()=>{
 const values=[100,100,100,200,200,200,120,120,120,120,120,120,120,120];
 const source=series(values);
 const constant=series(values.map(value=>value+5));
 assert.deepEqual(compareTemporalLuma(source,constant).candidates,[]);
 // Larger grade response exactly on a cut is not stable-source evidence.
 const cutChanged=series(values.map((value,i)=>value+5+(i>=3&&i<6?12:0)));
 assert.deepEqual(compareTemporalLuma(source,cutChanged).candidates,[]);
});

test('misaligned timestamps and invalid samples cannot produce confident analysis',()=>{
 const source=series(Array(24).fill(100));
 const outOfSync=series(Array(24).fill(104),0.5);
 const report=compareTemporalLuma(source,outOfSync);
 assert.equal(report.status,'not_measured');
 assert.deepEqual(report.candidates,[]);
});
