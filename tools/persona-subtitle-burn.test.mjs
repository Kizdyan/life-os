import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {buildSubtitleAss,burnPersonaSubtitles,loadApprovedSubtitleReference} from './persona-subtitle-burn.mjs';

test('invalid timestamps and ASS control syntax cannot enter the rendering filter',async()=>{
 const {style:reference}=await loadApprovedSubtitleReference();
 for(const cues of [[{startMs:0,endMs:1000,text:'{\\pos(0,0)}'}],[{startMs:-1,endMs:5,text:'текст'}],[{startMs:0,endMs:1000,text:'один'},{startMs:900,endMs:1100,text:'два'}]])
  assert.throws(()=>buildSubtitleAss({cues,width:1080,height:1920,reference}));
});

test('reference subtitle style keeps full approved blocks and uses configured ASS typography',async()=>{
 const {style:reference}=await loadApprovedSubtitleReference();
 const input={cues:[{startMs:200,endMs:2200,text:'Бюджет только на\nодного'}],width:1080,height:1920};
 const result=buildSubtitleAss({...input,reference});
 assert.equal(result.cues[0].text,'БЮДЖЕТ ТОЛЬКО НА\nОДНОГО');
 assert.equal(result.cues.length,1);
 assert.match(result.ass,/Cormorant Garamond Light,98,&H00A8DBE8/);
 assert.match(result.ass,/\\pos\(540,1334\)\\fad\(167,0\)/);
 assert.match(result.ass,/НА\\NОДНОГО/);
 assert.throws(()=>buildSubtitleAss({...input,reference:{...reference,color:'bad'}}),/Invalid reference/);
});

test('beat-aligned ASS zooms the keyword and starts on the selected frame',async()=>{
 const {style:reference}=await loadApprovedSubtitleReference();
 const cue={startMs:1133,endMs:3533,text:'бюджет только на\nодного',kinetic:true,keywords:['одного']};
 const settings={cues:[cue],width:1080,height:1920,reference};
 const result=buildSubtitleAss(settings);
 assert.ok(result.ass.includes(String.raw`0:00:01.13,0:00:03.53,Persona,,0,0,0,,{\pos(540,1334)}БЮДЖЕТ ТОЛЬКО НА\N{\fscx90\fscy90\t(0,200,\fscx100\fscy100)}ОДНОГО`));
 assert.doesNotMatch(result.ass,/\\fad/);
 assert.throws(()=>buildSubtitleAss({...settings,cues:[{...cue,keywords:['постороннее']}]}),/kinetic keywords/);
});

test('genre changes title motion without replacing immutable typography',async()=>{
 const {style:reference}=await loadApprovedSubtitleReference();
 const cue={startMs:1500,endMs:3900,text:'Проверка'};
 const base={width:1080,height:1920,reference};
 const sad=buildSubtitleAss({...base,cues:[{...cue,fadeMs:420}]}).ass;
 const epic=buildSubtitleAss({...base,cues:[{...cue,motion:'fly-in'}]}).ass;
 assert.ok(sad.includes(String.raw`\fad(420,0)`));
 assert.ok(epic.includes(String.raw`\move(540,1420,540,1334,0,100)`));
 for (const ass of [sad,epic])assert.match(ass,/Cormorant Garamond Light,98,&H00A8DBE8/);
});

const available=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
test('Dynamic Interview groups words and adds a centered red accent with a 120 ms pop',()=>{
 const result=buildSubtitleAss({preset:'dynamic-interview',width:1080,height:1920,cues:[
  {startMs:0,endMs:2400,text:'Это / просто / бизнес',keywords:['бизнес']},
  {startMs:2700,endMs:4500,text:'У нас 12 раз'}
 ]});
 assert.deepEqual(result.cues.map(c=>[c.startMs,c.endMs,c.text]),[
  [0,800,'ЭТО'],[800,1600,'ПРОСТО'],[1600,2400,'БИЗНЕС'],[2700,3600,'У НАС'],[3600,4500,'12 РАЗ']
 ]);
 assert.match(result.ass,/Montserrat ExtraBold,95,&H00FFFFFF/);
 assert.match(result.ass,/\\pos\(540,1229\)/);
 assert.match(result.ass,/\\t\(0,120,\\fscx100\\fscy100\)/);
 assert.match(result.ass,/\\c&H2012E3&\\fs120\}БИЗНЕС/);
 assert.match(result.ass,/\\c&H2012E3&\\fs120\}12/);
 assert.throws(()=>buildSubtitleAss({preset:'invalid',width:1080,height:1920,cues:result.cues}),/Unsupported subtitle preset/);
});

test('Dynamic Interview breaks wide pairs and compresses single words within the safe width',()=>{
 const {ass,cues}=buildSubtitleAss({preset:'dynamic-interview',width:1080,height:1920,cues:[
  {startMs:0,endMs:1200,text:'сверхвыразительный кинематографичный'}
 ]});
 assert.deepEqual(cues.map(c=>c.text),['СВЕРХВЫРАЗИТЕЛЬНЫЙ','КИНЕМАТОГРАФИЧНЫЙ']);
 assert.match(ass,/\\t\(0,120,\\fscx[1-9]\d\\fscy100\)/);
});

function run(bin,args){const r=spawnSync(bin,args,{encoding:null,timeout:60000});assert.equal(r.status,0,r.stderr?.toString());return r.stdout}
function titlePixels(bytes){let n=0;for(let i=0;i<bytes.length;i+=3)if(bytes[i]>130&&bytes[i+1]>125&&bytes[i+2]>80)n++;return n}
test('real FFmpeg burns visible Cyrillic text into pixels, preserves audio and refuses overwrite',{skip:!available},async()=>{
 const root=await mkdtemp(join(tmpdir(),"persona-captions-' "));
 try{
  const input=join(root,'source.mp4'),output=join(root,'burned.mp4'),review=join(root,'review.json');
  run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=0x123446:s=320x568:r=30:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-c:a','aac','-shortest',input]);
  const before=await readFile(input);
  await writeFile(review,JSON.stringify({cues:[{startMs:200,endMs:1400,text:'Музыка меняет настроение.'}],captionTiming:'segment-needs-review'}));
  const result=await burnPersonaSubtitles({videoPath:input,reviewPath:review,outputPath:output});
  const frame=t=>run('ffmpeg',['-v','error','-ss',String(t),'-i',output,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
  assert.ok(titlePixels(frame(.5))>20,'Cyrillic captions must be visible in decoded MP4 pixels');
  assert.equal(titlePixels(frame(1.8)),0,'No subtitles after the speech cue, including musical tails');
  const audio=path=>run('ffmpeg',['-v','error','-i',path,'-vn','-f','s16le','-']);
  assert.deepEqual(audio(output),audio(input),'Audio is copied, not reprocessed');
  assert.deepEqual(await readFile(input),before,'Original bytes stay unchanged');
  assert.equal(result.output.sha256,createHash('sha256').update(await readFile(output)).digest('hex'));
  await assert.rejects(burnPersonaSubtitles({videoPath:input,reviewPath:review,outputPath:output}),/exists/);
 }finally{await rm(root,{recursive:true,force:true})}
});
