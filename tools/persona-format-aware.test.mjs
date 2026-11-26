import test from 'node:test';
import assert from 'node:assert/strict';
import {continuityEditPlan,PERSONA_VIDEO_FORMATS} from './persona-quick-render.mjs';

const sha='a'.repeat(64);
const take=(seconds)=>({durationSec:seconds,sha256:sha});

test('video format choices are explicit and include conversation, acting and music',()=>{
 assert.equal(PERSONA_VIDEO_FORMATS.explainer,'Экспертный');
 assert.equal(PERSONA_VIDEO_FORMATS.acting,'Актёрская сцена');
 assert.equal(PERSONA_VIDEO_FORMATS.music,'Музыкальный');
});

test('preserves complete short takes, their sequence, and original timing',()=>{
 const plan=continuityEditPlan([take(16),take(27)],'dialogue');
 assert.deepEqual(plan.choices.map(c=>[c.fileIndex,c.startSec,c.durationSec]),[[0,0,16],[1,0,27]]);
 assert.equal(plan.durationSec,43);
 assert.equal(plan.requiresHumanReview,true);
 assert.equal(plan.videoFormat,'dialogue');
 assert.equal(plan.audioUnderstanding,'not_transcribed');
});

test('one talking-head source is split into adjacent pieces with no missing frames',()=>{
 const plan=continuityEditPlan([take(24)],'personal');
 assert.deepEqual(plan.choices.map(c=>[c.startSec,c.durationSec]),[[0,12],[12,12]]);
 assert.equal(plan.durationSec,24);
 assert.ok(plan.choices.every(c=>c.caption===''));
});

test('never truncates long speech or guesses content from invalid sources',()=>{
 assert.throws(()=>continuityEditPlan([take(45),take(40)],'explainer'),/75/);
 assert.throws(()=>continuityEditPlan([{durationSec:20,sha256:'not-hash'}],'acting'),/SHA-256/);
 assert.throws(()=>continuityEditPlan([take(12)],'auto'),/формат/i);
});
