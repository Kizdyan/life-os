import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rename,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describeFrameVision,scanLibrary,searchCatalog} from './persona-local-library.mjs';

const ffmpegReady=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{encoding:'utf8'}).status===0);
test('library refuses to index catalog inside watched sources',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-lib-safety-'));
 try{
  await assert.rejects(scanLibrary({inbox:root,catalogDir:join(root,'catalog')}),/must not be inside inbox/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('search never pretends that a filename or annotation is verified vision',()=>{
 const index={kind:'persona-local-library-v1',assets:[{
  id:'sha256:'+'a'.repeat(64),sourcePath:'/example/IMG_0001.mov',sha256:'a'.repeat(64),
  kind:'video',metadata:{durationSec:12},availability:'local',
  annotation:{description:'Электричка проезжает по мосту',tags:['поезд'],
   segments:[{startSec:4,endSec:7,description:'поезд едет быстро',tags:['дорога'],
    source:'author_annotation'}]},
  frames:[{timeSec:6,source:'none',description:'',tags:[]}],
 }]};
 const results=searchCatalog(index,'электричка');
 assert.equal(results.length,1);
 assert.equal(results[0].source,'author_annotation');
 assert.equal(results[0].startSec,null);
 assert.equal(results[0].assetId,'sha256:'+'a'.repeat(64));
 const timed=searchCatalog(index,'поезд');
 assert.equal(timed[0].startSec,4);
 assert.equal(timed[0].source,'author_annotation');
 assert.equal(searchCatalog(index,'аккордеон').length,0);
});
test('real local vision connector sends actual pixels and returns model provenance',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-vision-'));try{
  const image=join(root,'frame.png');
  const actualPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/Wp0AAAAASUVORK5CYII=','base64');
  await writeFile(image,actualPng);
  let seen=false;
  const detected=await describeFrameVision(image,{visionModel:'vision-local',
   fetchImpl:async(url,options)=>{
    assert.equal(url,'http://127.0.0.1:11434/api/chat');
    const payload=JSON.parse(options.body);
    assert.equal(payload.model,'vision-local');
    assert.deepEqual(Buffer.from(payload.messages[1].images[0],'base64'),actualPng);
    seen=true;
    return {ok:true,json:async()=>({message:{content:JSON.stringify({
      description:'Поезд у платформы',tags:['поезд','платформа'],
    })}})};
   }});
  assert.equal(seen,true);
  assert.equal(detected.source,'local_vision_model');
  assert.equal(detected.model,'vision-local');
  assert.equal(detected.tags[0],'поезд');
  await assert.rejects(describeFrameVision(image,{visionModel:'vision-local',
   ollamaUrl:'https://remote.example.org'}),/local loopback/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('FFmpeg-indexed real synthetic MP4: immutable originals, thumbs, metadata, timecode search, incremental and missing',{skip:!ffmpegReady},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-lib-integration-'));
 try{
  const inbox=join(root,'inbox'),catalogDir=join(root,'index');await mkdir(inbox);
  const video=join(inbox,'Railway_01.mp4');
  const p=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',
    'testsrc2=size=320x568:rate=24:duration=3','-f','lavfi','-i',
    'sine=frequency=480:sample_rate=48000:duration=3','-c:v','libx264',
    '-threads','2','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest',video],
   {encoding:'utf8',timeout:25000});
  assert.equal(p.status,0,p.stderr);
  await writeFile(video+'.persona.json',JSON.stringify({description:'Электричка на платформе',
   tags:['транспорт'],segments:[{startSec:.5,endSec:2.4,
    description:'Поезд проезжает по железнодорожной линии',tags:['поезд','движение']}]},null,2));
  const before=createHash('sha256').update(await readFile(video)).digest('hex');
  const one=await scanLibrary({inbox,catalogDir});
  assert.equal(one.filesSeen,1);assert.equal(one.available,1);
  assert.equal(one.errors.length,0);assert.equal(one.visualDescriptions,0);
  const indexed=JSON.parse(await readFile(one.index,'utf8'));
  const asset=indexed.assets[0];
  assert.equal(asset.sha256,before);
  assert.equal(asset.kind,'video');
  assert.ok(asset.metadata.durationSec>2.9);
  assert.equal(asset.frames.length,3);
  assert.ok(asset.frames.every(f=>f.source==='none'&&!f.description));
  for(const frame of asset.frames)assert.ok((await stat(join(catalogDir,'thumbnails',frame.thumbnail))).size>100);
  const hits=searchCatalog(indexed,'поезд');
  assert.ok(hits.some(h=>h.startSec===.5&&h.endSec===2.4));
  assert.ok(hits.every(h=>h.source==='author_annotation'));
  const two=await scanLibrary({inbox,catalogDir});
  assert.equal(two.errors.length,0);
  const refreshed=JSON.parse(await readFile(one.index,'utf8'));
  assert.equal(refreshed.assets[0].id,asset.id);
  assert.equal(createHash('sha256').update(await readFile(video)).digest('hex'),before);
  // Source can disappear while an immutable catalog identifier persists.
  await rename(video,join(root,'video-moved-outside-inbox.mp4'));
  const third=await scanLibrary({inbox,catalogDir});
  assert.equal(third.available,0);
  const missing=JSON.parse(await readFile(one.index,'utf8'));
  assert.equal(missing.assets[0].availability,'missing');
  assert.equal(searchCatalog(missing,'поезд').length,0);
 }finally{await rm(root,{recursive:true,force:true})}
});
