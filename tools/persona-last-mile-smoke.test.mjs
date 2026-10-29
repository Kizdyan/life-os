/**
 * Last-mile smoke test: REAL Persona timeline renderer + REAL Persona media QA.
 * Only offline Whisper recognition is a fixture; never claim speech accuracy.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runFirstReel } from './persona-first-reel-runner.mjs';

const tools=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{encoding:'utf8'}).status===0);
const mkJson=(path,data)=>writeFile(path,JSON.stringify(data,null,2)+'\n');
const here=dirname(fileURLToPath(import.meta.url));

test('actual end-to-end: synthetic video → stub-ASR timestamps → actual Persona MP4 renderer → actual Persona QA',{skip:!tools,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-last-mile-'));
 try {
  const originals=[];
  for(const [i,color] of ['blue','red'].entries()) {
   const name=join(root,'scene'+i+'.mp4');
   const ff=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c='+color+':s=240x320:r=30','-f','lavfi','-i','sine=frequency='+(i?600:400)+':sample_rate=48000','-t','2.8','-c:v','mpeg4','-c:a','aac','-shortest',name],{encoding:'utf8',timeout:30000});
   assert.equal(ff.status,0,ff.stderr);
   originals.push({path:name,bytes:await readFile(name)});
  }
  const sources=join(root,'sources.json'),brief=join(root,'brief.json');
  await mkJson(sources,{version:1,sources:originals.map((x,i)=>({id:'take'+i,path:x.path}))});
  await mkJson(brief,{version:1,sourceFormat:'reel',
   script:[{order:1,line:'Я актёр. И ещё пишу музыку.',durationSec:2.2},
           {order:2,line:'И у нас есть проблема.',durationSec:2.0}],
   shots:[{order:1,durationSec:2.2,action:'Крупный план актёра'},
          {order:2,durationSec:2.0,action:'Композитор за клавишами'}]});
  // Mock timestamps are deliberately NOT acoustic recognition.
  // Inject ONLY the ASR fixture. Keep the real Persona timeline renderer and real QA.
  // Native Windows execution no longer depends on launching a .cjs file as an executable.
  const fakeModel=join(root,'fixture-model.bin');
  await writeFile(fakeModel,Buffer.alloc(1024*1024+1));
  const fixtureTranscribe=async analysisPath=>{
   const packet=JSON.parse(await readFile(analysisPath,'utf8'));
   const outputs=[];
   for(const source of packet.sources){
    const words=source.id==='take0'?['Я','актёр','И','ещё','пишу','музыку']:['И','у','нас','есть','проблема'];
    const output=join(dirname(analysisPath),source.id+'-whisper.json');
    await writeFile(output,JSON.stringify({transcription:words.map((text,i)=>({
     text,offsets:{from:200+i*280,to:460+i*280}
    }))}));
    outputs.push({sourceId:source.id,transcriptPath:output});
   }
   return {status:'fixture-asr-only',results:outputs};
  };
  const out=join(root,'release-candidate');
  const result=await runFirstReel({
   sources,brief,outputDir:out,whisperCli:process.execPath,whisperModel:fakeModel,transcribeStep:fixtureTranscribe,
   rendererPath:join(here,'persona-timeline-render.mjs'),
   verifierPath:join(here,'persona-verify-render.mjs')
  });
  assert.equal(result.status,'awaiting-author-review');
  assert.equal(result.distributionAllowed,false);
  assert.equal(result.events.length,6);
  const generated=await stat(result.output);
  assert.ok(generated.size>10000);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,width,height:format=duration','-of','json',result.output],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  const media=JSON.parse(probe.stdout);
  assert.ok(media.streams.some(x=>x.codec_type==='video'&&x.codec_name==='h264'&&x.width===1080&&x.height===1920));
  assert.ok(media.streams.some(x=>x.codec_type==='audio'&&x.codec_name==='aac'));
  assert.ok(Number(media.format.duration)>2.5);
  const qa=JSON.parse(await readFile(result.qaPath,'utf8'));
  assert.equal(qa.evidence.videoCodec,'h264');
  assert.equal(qa.evidence.fps,30,'export must remain constant-frame-rate at target 30 fps');
  assert.equal(qa.evidence.audioCodec,'aac');
  assert.equal(qa.evidence.blackFrameCheckPassed,true);
  assert.equal(qa.evidence.audioCheckPassed,true);
  assert.deepEqual(qa.handoff.errors,['author approval required']);
  assert.equal(qa.handoff.passed,false); // publish gate remains CLOSED
  assert.equal(qa.distribution,null);
  for(const original of originals)assert.deepEqual(await readFile(original.path),original.bytes);
  const saved=JSON.parse(await readFile(join(out,'RESULT.json'),'utf8'));
  assert.equal(saved.status,'awaiting-author-review');
 }finally{await rm(root,{recursive:true,force:true})}
});
