import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {buildSoundDesign,measuredSoundtrackGain,adaptiveMixFilter,assessRenderedMix} from './persona-sound-design.mjs';
test('adaptive sound protects unknown audible sources and excludes performance/manual drafts',()=>{
 const base={enabled:true,fastDraft:false,format:'dialogue'};
 assert.equal(buildSoundDesign({...base,sourceAudio:[false,false]}).mode,'silent-source');
 for(const sourceAudio of [[true],[null],[],[false,true]])assert.equal(buildSoundDesign({...base,sourceAudio}).mode,'protect-original');
 for(const patch of [{format:'acting'},{format:'music'},{fastDraft:true},{enabled:false}])assert.equal(buildSoundDesign({...base,...patch}).status,'MANUAL_MIX_RETAINED');
 const gain=measuredSoundtrackGain({integratedLufs:-12,truePeakDb:-.2},'protect-original');
 assert.equal(gain.gainDb,-20);assert.equal(gain.volume,.1);
 assert.equal(measuredSoundtrackGain({integratedLufs:-40,truePeakDb:-12},'silent-source').gainDb,0);
 assert.equal(measuredSoundtrackGain(null,'protect-original').volume,.12);
 assert.equal(assessRenderedMix({integratedLufs:-20,truePeakDb:-.3}).status,'REVIEW_WARNING');
 assert.equal(assessRenderedMix(null).status,'NOT_MEASURED');
});
test('real FFmpeg ducks music when original signal becomes active without attenuating original tone',{skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0},()=>{
 const run=mode=>{
  const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-f','lavfi','-i','aevalsrc=if(between(t\\,1\\,2)\\,0.3*sin(2*PI*440*t)\\,0):s=48000:d=3',
   '-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=3','-filter_complex',adaptiveMixFilter({mode,volume:.5,totalSec:3}),'-map','[a]','-f','f32le','-ac','1','pipe:1'],{maxBuffer:2*1024*1024});
  assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stdout.length,3*48000*4);return r.stdout;
 };
 function amp(buffer,hz,a,b){
  let x=0,y=0,n=0;
  for(let i=Math.round(a*48000);i<Math.round(b*48000);i++){
   const v=buffer.readFloatLE(i*4),t=2*Math.PI*hz*i/48000;
   x+=v*Math.cos(t);y+=v*Math.sin(t);n++;
  }
  return 2*Math.hypot(x,y)/n;
 }
 const protectedMix=run('protect-original'),control=run('silent-source');
 assert.ok(amp(protectedMix,880,1.5,1.9)<amp(control,880,1.5,1.9)*.4);
 assert.ok(Math.abs(amp(protectedMix,440,1.5,1.9)-amp(control,440,1.5,1.9))<.005);
 assert.ok(Math.abs(amp(protectedMix,880,.5,.9)-amp(control,880,.5,.9))<.005);
});
