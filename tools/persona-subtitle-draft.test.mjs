import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSubtitleDraft,writeSubtitleDraft} from './persona-subtitle-draft.mjs';

const brief={
 version:1,sourceFormat:'reel',
 script:[{order:1,line:'Я актёр. И ещё пишу музыку.'},
   {order:2,line:'И у нас есть проблема.'}],
 shots:[{order:1,action:'Говорит в камеру'}, {order:2,action:'Спокойно за пианино'}]
};
const timeline={version:1,clips:[
 {path:'actor.mp4',startSec:0.4,durationSec:2.145},
 {path:'composer.mp4',startSec:0.7,durationSec:2.2}
]};

test('draft subtitles align to concatenated edit order, not source video start times',()=>{
 const r=buildSubtitleDraft(brief,timeline);
 assert.match(r.srt,/1\n00:00:00,000 --> 00:00:02,145\nЯ актёр\. И ещё пишу музыку\./u);
 assert.match(r.srt,/2\n00:00:02,145 --> 00:00:04,345\nИ у нас есть проблема\./u);
 assert.match(r.vtt,/WEBVTT\n\n00:00:00\.000 --> 00:00:02\.145/u);
 assert.equal(r.review.status,'needs-human-review');
 assert.equal(r.review.captionTiming,'estimated-from-assembled-shot-boundaries-not-word-level-speech');
 assert.equal(r.review.cues.length,2);
 assert.equal(r.review.totalTimelineSec,4.345);
 assert.match(r.review.warnings.join(' '),/No subtitles are burned into the MP4/u);
});

test('long-but-valid Russian dialogue is wrapped to two readable lines, no truncation',()=>{
 const updated=structuredClone(brief);
 updated.script[0].line='Завтра утром у нас проба. И после неё мне ещё нужно дописать аранжировку.';
 const result=buildSubtitleDraft(updated,timeline);
 const caption=result.review.cues[0].text;
 assert.equal(caption.split('\n').length,2);
 assert.ok(caption.split('\n').every(x=>x.length<=42));
 assert.equal(caption.replaceAll('\n',' '),updated.script[0].line);
});

test('music-tail cue must be manually retimed; never pretend speech continues through music',()=>{
 const updated=structuredClone(brief);
 updated.shots[1].action='После реплики 2 секунды оригинальной музыки';
 assert.match(buildSubtitleDraft(updated,timeline).review.warnings.join(' '),/Subtitle end must be adjusted/);
});

test('Whisper word timestamps are translated into montage time and stop before a music tail',()=>{
 const updated=structuredClone(brief);
 updated.shots[1].action='После реплики 2 секунды оригинальной музыки';
 const decisions={version:1,choices:[
  {beat:1,sourceId:'actor',startSec:10.4,durationSec:2.145,captionWords:[
   {text:'Я',startSec:10.6,endSec:10.78,timing:'word'},
   {text:'актёр.',startSec:10.8,endSec:11.2,timing:'word'}]},
  {beat:2,sourceId:'composer',startSec:20.7,durationSec:2.2,captionWords:[
   {text:'И',startSec:20.9,endSec:21.02,timing:'word'},
   {text:'у',startSec:21.04,endSec:21.13,timing:'word'},
   {text:'нас',startSec:21.15,endSec:21.34,timing:'word'},
   {text:'есть',startSec:21.36,endSec:21.56,timing:'word'},
   {text:'проблема.',startSec:21.58,endSec:21.95,timing:'word'}]}
 ]};
 const result=buildSubtitleDraft(updated,timeline,decisions);
 assert.match(result.srt,/00:00:00,200 --> 00:00:00,920\nЯ актёр\./u);
 assert.match(result.srt,/00:00:02,345 --> 00:00:03,515\nИ у нас есть проблема\./u);
 assert.equal(result.review.captionTiming,'word-level-from-whisper-timestamps');
 assert.ok(result.review.cues[1].endMs<4345,'caption must end before the music tail');
});

test('mixed timed and estimated captions are explicitly marked for manual timing review',()=>{
 const decisions={version:1,choices:[
  {beat:1,sourceId:'actor',startSec:0,durationSec:2.145,captionWords:[
   {text:'Я',startSec:.1,endSec:.2,timing:'word'},
   {text:'актёр.',startSec:.22,endSec:.5,timing:'word'}]},
  {beat:2,sourceId:'composer',startSec:0,durationSec:2.2}
 ]};
 const result=buildSubtitleDraft(brief,timeline,decisions);
 assert.equal(result.review.captionTiming,'mixed-whisper-and-estimated-needs-review');
 assert.match(result.review.warnings.join(' '),/estimated clip boundaries/iu);
});

test('refuses inconsistent beats and captions exceeding two lines',()=>{
 assert.throws(()=>buildSubtitleDraft(brief,{version:1,clips:[timeline.clips[0]]}),/aligned/);
 const bad=structuredClone(brief);bad.script[0].order=5;
 assert.throws(()=>buildSubtitleDraft(bad,timeline),/Invalid duration or scene order/);
 bad.script[0].order=1;bad.script[0].line='очень '.repeat(20);
 assert.throws(()=>buildSubtitleDraft(bad,timeline),/exceeds two lines/);
});

test('writes new reviewable SRT and VTT, but never overwrites previous captions',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-captions-'));
 try{
  const briefPath=join(dir,'brief.json'),timelinePath=join(dir,'timeline.json');
  await writeFile(briefPath,JSON.stringify(brief));
  await writeFile(timelinePath,JSON.stringify(timeline));
  const written=await writeSubtitleDraft({briefPath,timelinePath,outputDir:dir});
  assert.equal(written.cues,2);
  assert.match(await readFile(written.srtPath,'utf8'),/Я актёр/);
  assert.match(await readFile(written.vttPath,'utf8'),/WEBVTT/);
  assert.equal(JSON.parse(await readFile(written.reviewPath,'utf8')).status,'needs-human-review');
  await assert.rejects(()=>writeSubtitleDraft({briefPath,timelinePath,outputDir:dir}),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});

test('preview captions include selected beats only and record the missing scenes',()=>{
 const previewTimeline={version:1,mode:'preview',missingBeats:[2],clips:[{beat:1,path:'opening.mp4',startSec:0,durationSec:2}]};
 const decisions={version:1,mode:'preview',missingBeats:[2],choices:[{beat:1,sourceId:'opening',startSec:0,durationSec:2,captionWords:[
  {text:'Я',startSec:.1,endSec:.3,timing:'word'},{text:'актёр.',startSec:.32,endSec:.8,timing:'word'}
 ]}]};
 const result=buildSubtitleDraft(brief,previewTimeline,decisions);
 assert.equal(result.review.cues.length,1);
 assert.match(result.srt,/Я актёр\./u);
 assert.doesNotMatch(result.srt,/И у нас есть проблема/u);
 assert.deepEqual(result.review.missingBeats,[2]);
});
