import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoalescedDrain} from '../packages/core/src/persona-processing-drain.mjs';
import {setTimeout as delay} from 'node:timers/promises';

test('arrival while desktop worker is processing wakes next drain',async()=>{
 let started=0,release,proceed=new Promise(resolve=>{release=resolve;});
 const drain=createCoalescedDrain(async()=>{started++;if(started===1)await proceed;});
 const one=drain();
 await delay(0);
 const two=drain();
 release();
 await Promise.all([one,two]);
 assert.equal(started,2,'lost new queue wake-up');
});
test('multiple notifications do not start concurrent worker instances',async()=>{
 let count=0,active=0,maxActive=0;
 const drain=createCoalescedDrain(async()=>{
  active++;maxActive=Math.max(maxActive,active);count++;await delay(8);active--;
 });
 const first=drain();
 await delay(0); // ensure the first batch is already running
 await Promise.all([first,...Array.from({length:10},()=>drain())]);
 assert.equal(maxActive,1);
 assert.equal(count,2,'burst coalesced to one follow-up scan');
});
