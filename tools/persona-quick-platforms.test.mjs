import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
import {photoOutputSize} from './persona-quick-platforms.mjs';

const ready=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
const hash=b=>createHash('sha256').update(b).digest('hex');
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const info=path=>{
 const r=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height:format=duration',
  '-of','json',path],{encoding:'utf8',timeout:30000});
 assert.equal(r.status,0,r.stderr);const parsed=JSON.parse(r.stdout);
 return {...parsed.streams.find(s=>s.codec_type==='video'),duration:Number(parsed.format.duration)};
};
test('carousel aspect allowlist',()=>{
 assert.deepEqual(photoOutputSize('4:5'),[1080,1350]);
 assert.deepEqual(photoOutputSize('1:1'),[1080,1080]);
 assert.throws(()=>photoOutputSize('16:9'));
});
test('3 original JPEG/PNG -> real graded and Gold-captioned 4:5 ZIP; slideshow -> 9:16 platform master and VK variants',
 {skip:!ready,timeout:450000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-photo-platform-e2e-'));
 let worker;
 try{
  const inputs=[];
  for(const [i,color,ext] of [[1,'red','jpg'],[2,'blue','png'],[3,'green','jpg']]){
   const path=join(root,'image-'+i+'.'+ext);
   const args=['-nostdin','-v','error','-f','lavfi','-i','color=c='+color+':s=400x500',
    '-frames:v','1','-threads','1','-y',path];
   const r=spawnSync('ffmpeg',args,{encoding:'utf8',timeout:35000});
   assert.equal(r.status,0,r.stderr);const bytes=await readFile(path);
   assert.ok(bytes.length>=1024,'JPEG/PNG fixture must exceed 1 KB');
   inputs.push({path,name:'image-'+i+'.'+ext,bytes,sha:hash(bytes)});
  }
  const music=join(root,'my-music.wav');
  const mr=spawnSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',
   'sine=frequency=330:duration=12:sample_rate=48000','-ac','2','-c:a','pcm_s16le','-y',music],
   {timeout:35000,encoding:'utf8'});
  assert.equal(mr.status,0,mr.stderr);const musicBytes=await readFile(music);
  worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'worker'),quickRenderRoot:join(root,'quick')});
  const base='http://127.0.0.1:'+await worker.start();
  const headers={'X-Persona-Worker-Token':(await(await fetch(base+'/health')).json()).token};
  async function submit(contentType,attachments){
   const manifest={prompt:'Атмосферный музыкальный фоторяд',consent:true,
    contentType,carouselAspect:'4:5',autoStyle:false,styleChoice:'signature-gold',
    colorPreset:'DetailCinematic',textAccents:true,coverTitle:'Тишина перед первым аккордом',
    files:attachments.map(a=>({kind:a.kind||'photo',name:a.name,size:a.bytes.length}))};
   const created=await fetch(base+'/quick-render',{method:'POST',
    headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(manifest)});
   assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();
   for(const [i,a] of attachments.entries()){
    const r=await fetch(base+'/quick-render/'+id+'/upload/'+i,{method:'PUT',
     headers:{...headers,'X-Persona-Original-Name':encodeURIComponent(a.name)},body:a.bytes});
    assert.equal(r.status,200,await r.clone().text());
   }
   const run=await fetch(base+'/quick-render/'+id+'/run',{method:'POST',headers});
   assert.equal(run.status,202,await run.clone().text());
   let status;for(let n=0;n<900;n++){status=await(await fetch(base+'/quick-render/'+id+'/status',{headers})).json();
    if(['completed','failed'].includes(status.state))break;await wait(300);}
   assert.equal(status.state,'completed',status.error||status.stage);
   return status;
  }
  const images=inputs.map(({name,bytes})=>({name,bytes}));
  const carousel=await submit('photo-carousel',images);
  assert.equal(carousel.exportStatus,'COMPLETED');
  assert.equal(carousel.carouselFiles.length,3);
  assert.equal(carousel.carouselFiles[0].textOverlay,true);
  assert.equal(carousel.carouselFiles[1].textOverlay,false);
  assert.equal(carousel.colorPreset,'DetailCinematic');
  const carouselDir=join(root,'quick','quick-'+carousel.id,'output');
  const carouselResult=JSON.parse(await readFile(join(carouselDir,'RESULT.json'),'utf8'));
  assert.equal(carouselResult.contentType,'photo-carousel');
  assert.equal(carouselResult.colorPreset,'DetailCinematic');
  assert.equal(carouselResult.photos[0].textOverlay,true);
  for(let i=1;i<=3;i++){
   const item=info(join(carouselDir,'photo-0'+i+'.png'));
   assert.equal(item.width,1080);assert.equal(item.height,1350);
   assert.ok((await stat(join(carouselDir,'photo-0'+i+'.png'))).size>1024);
  }
  const zip=await fetch(base+'/quick-render/'+carousel.id+'/export/carousel?token='+headers['X-Persona-Worker-Token']);
  assert.equal(zip.status,200);const zipped=Buffer.from(await zip.arrayBuffer());
  assert.equal(zipped.readUInt32LE(0),0x04034b50);
  assert.ok(zipped.includes(Buffer.from('photo-03.png')));
  const poster=await fetch(base+'/quick-render/'+carousel.id+'/export/photo-1?token='+headers['X-Persona-Worker-Token']);
  assert.equal(poster.status,200);assert.match(poster.headers.get('content-type'),/image\/png/);
  for(const original of inputs)assert.equal(hash(await readFile(original.path)),original.sha);
  const slideshow=await submit('photo-slideshow',[
   ...images,{kind:'audio',name:'my-music.wav',bytes:musicBytes}]);
  const slideDir=join(root,'quick','quick-'+slideshow.id,'output');
  const master=info(join(slideDir,'ready.mp4'));
  assert.equal(master.width,1080);assert.equal(master.height,1920);
  assert.ok(master.duration>8);
  const start=await fetch(base+'/quick-render/'+slideshow.id+'/export-package',{method:'POST',headers});
  assert.equal(start.status,202,await start.clone().text());
  let state;for(let n=0;n<1200;n++){
   state=await(await fetch(base+'/quick-render/'+slideshow.id+'/status',{headers})).json();
   if(['COMPLETED','FAILED'].includes(state.exportStatus))break;await wait(300);
  }
  assert.equal(state.exportStatus,'COMPLETED',state.exportError||state.stage);
  assert.deepEqual(state.exportItems.map(x=>x.id).sort(),
   ['cover','instagram','tiktok','youtube','vk','vk-4x5'].sort());
  const pkg=join(slideDir,'platform-package');
  for(const platform of ['instagram','tiktok','youtube','vk']){
   const p=info(join(pkg,platform+'.mp4'));assert.equal(p.width,1080);assert.equal(p.height,1920);
  }
  const vk=info(join(pkg,'vk-4x5.mp4'));assert.equal(vk.width,1080);assert.equal(vk.height,1350);
  const cover=info(join(pkg,'cover.png'));assert.equal(cover.width,1080);assert.equal(cover.height,1920);
  const tiktok=await fetch(base+'/quick-render/'+slideshow.id+'/export/tiktok?token='+headers['X-Persona-Worker-Token']);
  assert.equal(tiktok.status,200);assert.ok((await tiktok.arrayBuffer()).byteLength>20000);
  const vkDownload=await fetch(base+'/quick-render/'+slideshow.id+'/export/vk-4x5?token='+headers['X-Persona-Worker-Token']);
  assert.equal(vkDownload.status,200);
  const receipt=JSON.parse(await readFile(join(pkg,'EXPORTS.json'),'utf8'));
  assert.equal(receipt.distributionAllowed,false);
  assert.equal(receipt.entries.length,6);
  const originalMaster=await readFile(join(slideDir,'ready.mp4'));
  assert.equal(hash(originalMaster),receipt.sourceSha256);
  for(const original of inputs)assert.equal(hash(await readFile(original.path)),original.sha);
  console.log('PHOTO_PLATFORM_MP4_PASS '+JSON.stringify({photos:3,carousel:[1080,1350],
   slideshow:[master.width,master.height],vk45:[vk.width,vk.height],
   cover:[cover.width,cover.height],platformExports:receipt.entries.length,syntheticMedia:true}));
 }finally{
  if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
  await rm(root,{recursive:true,force:true});
 }
});
