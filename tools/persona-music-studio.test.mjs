
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeMusicCandidates, audioMode, musicFormats, musicPictureFilters, resolveMusicStyle, visualMusicCandidate} from './persona-music-studio.mjs';
import {parseLearnedRules} from './persona-internet-learner.mjs';

test('production color mixes the Humble LUT at 60%, including Dynamic Soft',()=>{
 assert.match(musicPictureFilters({width:1080,height:1920},{mode:'native'},'Dynamic Soft')[2],/all_opacity=0\.6(?:,|$)/);
});

test('offline track selection leaves the default Independent Artist picture and titles alone',()=>{
 const style=resolveMusicStyle('cinematic',true);
 assert.equal(style.profile,null);
 assert.equal(style.kinetic,false);
 assert.equal(style.contract.mix,.6);
 assert.equal(resolveMusicStyle('dynamic-interview',true).profile,'Dynamic Soft');
});

test('reference analysis maps to bounded subtitle, color and hook settings',()=>{
 const rules={version:1,provider:'openrouter',sourceUrl:'https://www.instagram.com/reel/example/',
  subtitles:{preset:'dynamic-interview',color:'#f0ead8',sizePx1080:102},
  colorGrade:{temperature:'warm'},editing:{medianShotSec:1.8}};
 const profile=parseLearnedRules(rules);
 assert.equal(profile.preset,'dynamic-interview');
 assert.deepEqual(profile.typography,{color:'#F0EAD8',sizePx1080:102});
 assert.equal(profile.hookSeconds,1.8);
 assert.match(musicPictureFilters({width:1080,height:1920},{mode:'native'},null,profile)[1],/colorbalance=rs=0\.025:bs=-0\.025/);
 assert.throws(()=>parseLearnedRules({...rules,subtitles:{...rules.subtitles,color:'#FFF,unsafe'}}),/референса/);
 assert.throws(()=>parseLearnedRules({...rules,colorGrade:{temperature:'warm,unsafe'}}),/референса/);
});

test('five versioned formats use different structures and expose missing footage', () => {
 assert.equal(musicFormats.length,5);
 assert.equal(new Set(musicFormats.map(item=>item.structure.join('|'))).size,5);
 assert.ok(musicFormats.every(item=>item.version===1&&item.hook&&item.editRule));
 assert.throws(()=>analyzeMusicCandidates(new Float32Array(11025*15), 'Format_ActorAndComposer'), /актёрск/);
 assert.throws(()=>analyzeMusicCandidates(new Float32Array(11025*15), 'Format_SoundtrackToFrame'), /кадр/);
});

test('one emotion returns actual candidates with pause, accent and harmonic evidence', () => {
 const samples=Float32Array.from({length:11025*22},(_,i)=>{
  const t=i/11025;
  const note=t<.75||t>21.4?0:t<8?220:261.626;
  return note?Math.sin(2*Math.PI*note*t)*(.15+.18*Math.exp(-((t%1)*8))):0;
 });
 const result=analyzeMusicCandidates(samples,'Format_OneEmotion');
 assert.ok(result.candidates.length>0);
 assert.ok(result.candidates.every(({startSec,endSec})=>startSec>=0&&endSec<=22&&endSec-startSec>=8));
 assert.ok(result.silences.some(s=>s.startSec===0));
 assert.ok(result.harmonicChanges.some(s=>s.timeSec>=7.5&&s.timeSec<=8.5));
 assert.ok(result.accents.length>0);
 assert.throws(()=>analyzeMusicCandidates(new Float32Array(11025*12),'Format_OneEmotion'), /музыкальн/);
});

test('one note abstains for a dense chord instead of labelling it one note', () => {
 const samples=Float32Array.from({length:11025*9},(_,i)=>
  [.08*Math.sin(i/11025*2*Math.PI*220),.08*Math.sin(i/11025*2*Math.PI*261.626),.08*Math.sin(i/11025*2*Math.PI*329.628)].reduce((a,b)=>a+b));
 assert.throws(()=>analyzeMusicCandidates(samples,'Format_OneNote'), /ноту/);
});

test('auto music is off unless explicitly enabled and silent visual clips get real time bounds',()=>{
 assert.equal(audioMode(undefined),'original');
 assert.equal(audioMode(false),'original');
 assert.equal(audioMode(true),'auto');
 assert.throws(()=>audioMode('true'),/Автоподбор/);
 const analysis=visualMusicCandidate('Format_OneEmotion',10.21);
 assert.equal(analysis.candidates[0].endSec,10.2);
 assert.equal(analysis.candidates[0].evidence,'visual-duration');
 assert.throws(()=>visualMusicCandidate('Format_OneNote',8),/звуков|нот/);
});
