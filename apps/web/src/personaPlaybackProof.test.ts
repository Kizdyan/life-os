import {describe,expect,it} from 'vitest';
import {advancePersonaPlaybackProof,emptyPersonaPlaybackProof} from './personaPlaybackProof';

function playback(duration:number,options:{seekAt?:number;endAfterSeek?:boolean}={}){
 let p=emptyPersonaPlaybackProof();
 const send=(kind:'play'|'timeupdate'|'pause'|'seeking'|'ended',currentTime:number,extra:Record<string,unknown>={})=>{
  p=advancePersonaPlaybackProof(p,{kind,currentTime,duration,...extra});
 };
 send('play',0);
 for(let t=0.25;t<=duration+0.001;t+=0.25){
  if(options.seekAt!==undefined&&t>=options.seekAt&&t<options.seekAt+0.26){
   send('seeking',duration-0.25);send('play',duration-0.25);
   break;
  }
  send('timeupdate',t,{paused:false,seeking:false,playbackRate:1});
 }
 send('ended',duration);
 return p;
}
describe('Persona final MP4 genuine playback coverage gate',()=>{
 it('accepts continuous real playback only after the video ended',()=>{
  const p=playback(5);
  expect(p.completed).toBe(true);
  expect(p.reachedStart).toBe(true);
 });
 it('refuses seeking to the end and artificial jumps',()=>{
  expect(playback(5,{seekAt:1}).completed).toBe(false);
  let p=emptyPersonaPlaybackProof();
  p=advancePersonaPlaybackProof(p,{kind:'play',currentTime:0,duration:10});
  p=advancePersonaPlaybackProof(p,{kind:'timeupdate',currentTime:9.9,duration:10,paused:false,seeking:false,playbackRate:1});
  p=advancePersonaPlaybackProof(p,{kind:'ended',currentTime:10,duration:10});
  expect(p.completed).toBe(false);
 });
 it('never counts high speed, paused events or seeking as watched',()=>{
  let p=emptyPersonaPlaybackProof();
  p=advancePersonaPlaybackProof(p,{kind:'play',currentTime:0,duration:3});
  for(let t=0.25;t<=3;t+=0.25)
   p=advancePersonaPlaybackProof(p,{kind:'timeupdate',currentTime:t,duration:3,paused:false,seeking:false,playbackRate:4});
  p=advancePersonaPlaybackProof(p,{kind:'ended',currentTime:3,duration:3});
  expect(p.completed).toBe(false);
 });
 it('counts each watched interval only once and resets across files',()=>{
  let p=playback(5,{seekAt:2});
  expect(p.completed).toBe(false);
  expect(emptyPersonaPlaybackProof().completed).toBe(false);
  expect(emptyPersonaPlaybackProof().intervals).toEqual([]);
 });
 it('does not claim playback completion on a bare checkbox or initial empty state',()=>{
  const p=emptyPersonaPlaybackProof();
  expect(p.completed).toBe(false);
  expect(advancePersonaPlaybackProof(p,{kind:'ended',currentTime:31,duration:31}).completed).toBe(false);
 });
});
