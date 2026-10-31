import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAnimaticTimeline, wrapAnimaticText } from './persona-delivery-animatic.mjs';

test('animatic timeline preserves all seven candidate durations and reserves the B03 music tail',()=>{
 const brief={script:[
  {order:1,durationSec:3,line:'A',action:'a'},{order:2,durationSec:4,line:'B',action:'b'},
  {order:3,durationSec:5,line:'C',action:'c'},{order:4,durationSec:5,line:'D',action:'d'},
  {order:5,durationSec:4,line:'E',action:'e'},{order:6,durationSec:6,line:'F',action:'f'},
  {order:7,durationSec:4,line:'G',action:'g'}]};
 const timeline=buildAnimaticTimeline(brief,2.12);
 assert.equal(timeline.durationSec,31);
 assert.deepEqual(timeline.beats.map(beat=>[beat.startSec,beat.endSec]),[[0,3],[3,7],[7,12],[12,17],[17,21],[21,27],[27,31]]);
 assert.deepEqual(timeline.music,{startSec:23.38,endSec:25.5,beatOrder:6});
 assert.match(timeline.notice,/не снятый ролик/i);
});

test('animatic action cards wrap long instructions rather than cropping them off-screen',()=>{
 const wrapped=wrapAnimaticText('Действие: поднимает бровь, закрывает папку и выдерживает полсекунды тишины перед ответом.',42);
 assert.match(wrapped,/\n/u);
 assert.ok(wrapped.split('\n').every(line=>line.length<=42));
});
