import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {buildSubtitleAss,burnPersonaSubtitles} from './persona-subtitle-burn.mjs';

test('short phrases preserve every word and stay inside the original speech cue',()=>{
 const result=buildSubtitleAss({cues:[{startMs:200,endMs:2200,text:'Я говорю первую реплику.'},{startMs:2400,endMs:4400,text:'Музыка меняет настроение.'}],width:1080,height:1920});
 assert.deepEqual(result.cues.map(c=>c.text),['Я говорю','первую реплику.','Музыка меняет настроение.']);
 assert.equal(result.cues[0].startMs,200);assert.equal(result.cues[1].endMs,2200);
 assert.ok(result.cues.every(c=>c.endMs<=2200||c.startMs>=2400));
 assert.doesNotMatch(result.ass,/Arial/);assert.match(result.ass,/Segoe UI,72,/);assert.match(result.ass,/\\pos\(540,1267\)/);
 assert.match(result.timingMethod,/proportional/);
});

test('invalid timestamps and ASS control syntax cannot enter the rendering filter',()=>{
 for(const cues of [[{startMs:0,endMs:1000,text:'{\\pos(0,0)}'}],[{startMs:-1,endMs:5,text:'текст'}],[{startMs:0,endMs:1000,text:'один'},{startMs:900,endMs:1100,text:'два'}]])
  assert.throws(()=>buildSubtitleAss({cues,width:1080,height:1920}));
});
test('directed subtitle styles differ in weight, emphasis and measured fade configuration',()=>{
 const input={cues:[{startMs:0,endMs:2000,text:'Музыка меняет настроение.'}],width:1080,height:1920};
 const dynamic=buildSubtitleAss({...input,presetId:'Dynamic'}),cinematic=buildSubtitleAss({...input,presetId:'Cinematic'});
 assert.equal(dynamic.style.bold,true);assert.equal(cinematic.style.bold,false);
 assert.match(dynamic.ass,/\\c&H0000D7FF/);assert.match(cinematic.ass,/\\fad\(180,180\)/);
 assert.equal(dynamic.style.outline,5);assert.equal(cinematic.style.outline,1);
 assert.doesNotMatch(cinematic.ass,/\\c&H0000D7FF/);
 const commercial=buildSubtitleAss({...input,presetId:'Commercial',positionYRatio:.38});
 assert.equal(cinematic.style.font,'Segoe UI Light');assert.equal(dynamic.style.font,'Segoe UI');assert.equal(commercial.style.font,'Segoe UI');
 assert.match(commercial.ass,/&H00E0EAF5/);assert.equal(commercial.style.position.y,730);
});

const available=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
function run(bin,args){const r=spawnSync(bin,args,{encoding:null,timeout:60000});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
function whitePixels(bytes){let n=0;for(let i=0;i<bytes.length;i+=3)if(bytes[i]>210&&bytes[i+1]>210&&bytes[i+2]>210)n++;return n}
test('real FFmpeg burns visible Cyrillic text into pixels, preserves audio and refuses overwrite',{skip:!available},async()=>{
 const root=await mkdtemp(join(tmpdir(),"persona-captions-' "));
 try{
  const input=join(root,'source.mp4'),output=join(root,'burned.mp4'),review=join(root,'review.json');
  run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x123446:s=320x568:r=30:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-shortest',input]);
  const before=await readFile(input);
  await writeFile(review,JSON.stringify({cues:[{startMs:200,endMs:1400,text:'Музыка меняет настроение.'}],captionTiming:'segment-needs-review'}));
  const result=await burnPersonaSubtitles({videoPath:input,reviewPath:review,outputPath:output});
  const frame=t=>run('ffmpeg',['-v','error','-ss',String(t),'-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
  assert.ok(whitePixels(frame(.5))>100,'Cyrillic captions must be visible in decoded MP4 pixels');
  assert.equal(whitePixels(frame(1.8)),0,'No subtitles after the speech cue, including musical tails');
  const audio=path=>run('ffmpeg',['-v','error','-i',path,'-vn','-f','s16le','-']);
  assert.deepEqual(audio(output),audio(input),'Audio is copied, not reprocessed');
  assert.deepEqual(await readFile(input),before,'Original bytes stay unchanged');
  assert.equal(result.output.sha256,createHash('sha256').update(await readFile(output)).digest('hex'));
  await assert.rejects(burnPersonaSubtitles({videoPath:input,reviewPath:review,outputPath:output}),/exists/);
 }finally{await rm(root,{recursive:true,force:true})}
});
