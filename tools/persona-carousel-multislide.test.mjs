import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,copyFile,readFile,rm,stat,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ProductionJob} from './persona_orchestrator.mjs';
import {seedCarousels,carouselPlan,assertCarouselPlan,seededQuickId} from './seed_carousels.mjs';
import {normalizeCarouselSlides} from './persona-quick-platforms.mjs';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';

const available=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{stdio:'ignore'}).status===0);
const wait=ms=>new Promise(ok=>setTimeout(ok,ms));
const sha=b=>createHash('sha256').update(b).digest('hex');
test('10 authored plans and 40 exact safe per-slide Signature Gold titles',()=>{
 assert.equal(assertCarouselPlan().projects.length,10);
 assert.equal(carouselPlan.projects.reduce((n,p)=>n+p.slides.length,0),40);
 assert.equal(carouselPlan.projects[0].slides[0].text,'Он ещё верит');
 assert.equal(carouselPlan.projects[9].slides[3].text,'В центре — одна история');
 assert.throws(()=>normalizeCarouselSlides([{text:'Один титр'}],3),/exactly one/);
 assert.throws(()=>normalizeCarouselSlides([{text:'Один титр'},{text:'Один титр'},{text:'   '}],3));
 assert.throws(()=>normalizeCarouselSlides([{text:'Выход есть'},{text:'Выход есть'},{text:'Выход есть'}],4));
 for(const item of carouselPlan.projects)
  assert.equal(normalizeCarouselSlides(item.slides,4).length,4);
});
test('seed 10 genuine ProductionJobs: deterministic, idempotent, persistent, all waiting and visible on API',async t=>{
 const root=await mkdtemp(join(tmpdir(),'persona-carousel-seed-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const first=await seedCarousels(root);
 assert.equal(first.created,10);assert.equal(first.waiting,10);assert.equal(first.totalSlides,40);
 const second=await seedCarousels(root);
 assert.equal(second.created,0);assert.equal(second.existing,10);
 assert.deepEqual(first.jobs.map(x=>x.id),second.jobs.map(x=>x.id));
 for(const entry of first.jobs){
  assert.equal(entry.id,seededQuickId(entry.seedKey));
  const state=await new ProductionJob(entry.directory).read();
  assert.equal(state.status,'WAITING_FOR_FOOTAGE');
  assert.equal(state.assets.length,0);
  const saved=JSON.parse(await readFile(join(entry.directory,'quick-state.json'),'utf8'));
  assert.equal(saved.slides.length,4);
  assert.equal(saved.files.length,0);
  assert.equal(saved.sourceConsent,false);
 }
 const worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'media'),quickRenderRoot:root});
 const port=await worker.start();
 try{
  const key=(await(await fetch('http://127.0.0.1:'+port+'/health')).json()).token;
  const response=await fetch('http://127.0.0.1:'+port+'/quick-render',{headers:{'X-Persona-Worker-Token':key}});
  assert.equal(response.status,200);
  const jobs=(await response.json()).jobs;
  assert.equal(jobs.length,10);
  assert.deepEqual(jobs.map(x=>x.seedKey),carouselPlan.projects.map(p=>p.id));
  assert.ok(jobs.every(x=>x.state==='waiting_for_footage'&&x.productionStatus==='WAITING_FOR_FOOTAGE'));
  assert.ok(jobs.every(x=>x.slides?.length===4&&x.contentType==='photo-carousel'));
 }finally{await new Promise(ok=>worker.server.close(ok))}
});
test('3 real identical photos + 3 DISTINCT titles: every PNG contains own Gold lettering; ZIP member integrity',
 {skip:!available,timeout:330000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-carousel-three-titles-'));
 const proof=process.env.PERSONA_CAROUSEL_PROOF_DIR?
  resolve(process.env.PERSONA_CAROUSEL_PROOF_DIR):null;
 let worker;
 try{
  const file=join(root,'source.png');
  const generated=spawnSync('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i',
   'testsrc2=size=360x450:rate=1','-frames:v','1','-threads','1','-y',file],
   {encoding:'utf8',timeout:30000});
  assert.equal(generated.status,0,generated.stderr);
  const raw=await readFile(file),titles=['Он ещё верит','Теперь он сомневается','Решение уже принято'];
  assert.ok(raw.length>1024);
  worker=createPersonaMediaWorker({port:0,outputRoot:join(root,'media'),
   quickRenderRoot:join(root,'jobs')});
  const origin='http://127.0.0.1:'+await worker.start();
  const token=(await(await fetch(origin+'/health')).json()).token;
  const headers={'X-Persona-Worker-Token':token};
  const files=titles.map((_,i)=>({kind:'photo',name:'proof-'+(i+1)+'.png',size:raw.length}));
  const sent=await fetch(origin+'/quick-render',{method:'POST',
   headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({
    prompt:'Три состояния героя, три отдельных титра',contentType:'photo-carousel',
    carouselAspect:'4:5',colorPreset:'DetailCinematic',styleChoice:'signature-gold',
    autoStyle:false,textAccents:true,coverTitle:'Название только обложки',consent:true,
    slides:titles.map(text=>({text})),files})});
  assert.equal(sent.status,201,await sent.clone().text());
  const {id}=await sent.json();
  for(let i=0;i<3;i++){
   const r=await fetch(origin+'/quick-render/'+id+'/upload/'+i,{method:'PUT',
    headers:{...headers,'X-Persona-Original-Name':encodeURIComponent(files[i].name)},body:raw});
   assert.equal(r.status,200,await r.clone().text());
  }
  const launched=await fetch(origin+'/quick-render/'+id+'/run',{method:'POST',headers});
  assert.equal(launched.status,202,await launched.clone().text());
  let status;
  for(let i=0;i<750;i++){
   status=await(await fetch(origin+'/quick-render/'+id+'/status',{headers})).json();
   if(['completed','failed'].includes(status.state))break;
   await wait(350);
  }
  assert.equal(status.state,'completed',status.error||status.stage);
  assert.equal(status.captionDecision.mode,'per-slide-author');
  const out=join(root,'jobs','quick-'+id,'output');
  const report=JSON.parse(await readFile(join(out,'RESULT.json'),'utf8'));
  assert.deepEqual(report.photos.map(p=>p.captionText),titles);
  assert.deepEqual(report.photos.map(p=>p.captionSource),['author-slide','author-slide','author-slide']);
  assert.ok(report.photos.every(p=>p.textOverlay&&p.width===1080&&p.height===1350));
  assert.equal(report.colorPreset,'DetailCinematic');
  const pictures=await Promise.all([1,2,3].map(i=>readFile(join(out,'photo-0'+i+'.png'))));
  assert.equal(new Set(pictures.map(sha)).size,3,'three distinct captions must change output pixels');
  // All three source images are IDENTICAL: isolate upper 65% and lower third
  // to verify the only visible difference occurs where the titles are drawn.
  const rawCrop=(path,region)=>{
   const r=spawnSync('ffmpeg',['-nostdin','-v','error','-i',path,
    '-vf','crop=1080:'+region.height+':0:'+region.top+',format=gray',
    '-frames:v','1','-f','rawvideo','pipe:1'],{timeout:30000,maxBuffer:3*1024*1024});
   assert.equal(r.status,0,r.stderr?.toString());return sha(r.stdout);
  };
  const paths=[1,2,3].map(i=>join(out,'photo-0'+i+'.png'));
  const top=paths.map(p=>rawCrop(p,{height:760,top:0}));
  const bottom=paths.map(p=>rawCrop(p,{height:440,top:900}));
  assert.equal(new Set(top).size,1,'identical photos must remain identical outside caption region');
  assert.equal(new Set(bottom).size,3,'all three lower-third captions must produce different pixels');
  const downloaded=await fetch(origin+'/quick-render/'+id+'/export/carousel?token='+token);
  assert.equal(downloaded.status,200);const zip=Buffer.from(await downloaded.arrayBuffer());
  assert.equal(zip.readUInt32LE(0),0x04034b50);
  for(const i of [1,2,3])assert.ok(zip.includes(Buffer.from('photo-0'+i+'.png')));
  const one=await fetch(origin+'/quick-render/'+id+'/export/photo-2?token='+token);
  assert.equal(one.status,200);
  assert.equal(sha(Buffer.from(await one.arrayBuffer())),report.photos[1].sha256);
  if(proof){
   await mkdir(proof,{recursive:true});
   for(const i of [1,2,3])await copyFile(paths[i-1],join(proof,'slide-'+i+'.png'));
   await copyFile(join(out,'carousel.zip'),join(proof,'three-distinct-titles.zip'));
   await copyFile(join(out,'RESULT.json'),join(proof,'receipt.json'));
  }
  console.log('CAROUSEL_3_UNIQUE_GOLD_PASS '+JSON.stringify({texts:titles,
   output:[1080,1350],threeDifferentPixelRegions:true,zip:true,syntheticPhotos:true}));
 }finally{
  if(worker?.server?.listening)await new Promise(ok=>worker.server.close(ok));
  await rm(root,{recursive:true,force:true});
 }
});
