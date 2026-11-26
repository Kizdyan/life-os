import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createReadStream,promises as fs} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createPersonaQuickRenderService,quickVideoGeometry} from './persona-quick-render.mjs';
const available=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{stdio:'ignore'}).status===0);
test('right-angle metadata gives display geometry; arbitrary/nonfinite angles fail closed',()=>{
 for(const angle of [90,-90,270])assert.deepEqual(quickVideoGeometry({width:320,height:180,side_data_list:[{rotation:angle}]}),
  {width:180,height:320,codedWidth:320,codedHeight:180,rotationDeg:((angle%360)+360)%360});
 assert.equal(quickVideoGeometry({width:320,height:180,tags:{rotate:'180'}}).width,320);
 for(const rotation of [45,'bad',NaN,Infinity])assert.throws(()=>quickVideoGeometry({width:320,height:180,side_data_list:[{rotation}]}),/поворот/);
});
test('real rotated MOV reaches the same FFmpeg service with upright pixels, audio and intact original',
 {skip:!available,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-rotation-')),base=join(root,'base.mp4'),source=join(root,'iphone.mov');
 const run=(args)=>{const r=spawnSync('ffmpeg',['-v','error',...args],{encoding:null,timeout:60000});assert.equal(r.status,0,r.stderr?.toString());return r.stdout};
 run(['-f','lavfi','-i','color=c=blue:s=320x180:r=10:d=8','-f','lavfi','-i','sine=frequency=440:duration=8',
  '-vf','drawbox=x=0:y=0:w=160:h=180:color=red:t=fill','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',base]);
 const help=spawnSync('ffmpeg',['-hide_banner','-h','full'],{encoding:'utf8',maxBuffer:4*1024*1024}).stdout??'';
 // New FFmpeg versions removed the old rotate-metadata shortcut. Use the
 // actual display-matrix option when present; retain the older-runner syntax.
 run(help.includes('-display_rotation')?['-display_rotation:v:0','90','-i',base,'-c','copy',source]:
  ['-i',base,'-c','copy','-metadata:s:v:0','rotate=90',source]);
 const probed=spawnSync('ffprobe',['-v','error','-show_streams','-of','json',source],{encoding:'utf8'});
 assert.equal(probed.status,0);const geometry=quickVideoGeometry(JSON.parse(probed.stdout).streams.find(s=>s.codec_type==='video'));
 assert.equal(geometry.width,180);assert.equal(geometry.height,320,'Fixture must actually carry a 90-degree display matrix');
 const bytes=await readFile(source),hash=b=>createHash('sha256').update(b).digest('hex'),original=hash(bytes);
 const service=createPersonaQuickRenderService({quickRenderRoot:join(root,'jobs'),apiEnv:{OPENROUTER_API_KEY:'',OPENAI_API_KEY:''}});
 const job=await service.create({prompt:'Preserve the complete upright acting take',consent:true,videoFormat:'acting',
  autoStyle:false,textAccents:false,fastDraft:true,styleChoice:'cinematic',files:[{name:'iphone.mov',kind:'video',size:bytes.length}]});
 const req=createReadStream(source);req.headers={'content-length':String(bytes.length),'x-persona-original-name':'iphone.mov'};
 await service.upload(job.id,0,req);
 // Hold the final atomic commit: a status poll must not advertise completion
 // while quick-state.json still contains the running card (backup/restart race).
 const rename=fs.rename;let release,committing=false;
 const commitGate=new Promise(ok=>{release=ok});
 fs.rename=async(from,to)=>{
  if(String(to).startsWith(root)&&String(to).endsWith('quick-state.json')){
   const card=JSON.parse(await readFile(from,'utf8'));
   if(card.stage==='Готово'){committing=true;await commitGate;}
  }
  return rename(from,to);
 };
 syncBuiltinESMExports();
 try{
  await service.run(job.id);
  for(let i=0;i<160&&!committing;i++)await new Promise(r=>setTimeout(r,500));
  assert.equal(committing,true,'Final state commit must be exercised');
  assert.notEqual((await service.get(job.id)).state,'completed','Do not expose completion before the atomic card save');
 }finally{release();fs.rename=rename;syncBuiltinESMExports();}
 let final;for(let i=0;i<160;i++){final=await service.get(job.id);if(['completed','failed'].includes(final.state))break;await new Promise(r=>setTimeout(r,500));}
 assert.equal(final.state,'completed',final.error??final.stage);
 const result=JSON.parse(await readFile(join(root,'jobs','quick-'+job.id,'output','RESULT.json'),'utf8'));
 const output=join(root,'jobs','quick-'+job.id,'output',result.videoName);
 // Convert before reducing: a 1x2 YUV420 frame shares chroma between rows and
 // would turn red/blue orientation markers into the same purple pixel.
 const sample=p=>run(['-ss','1','-i',p,'-frames:v','1','-vf','format=rgb24,scale=1:2:flags=area','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);
 const expected=sample(source),actual=sample(output);
 for(const offset of [0,3]){assert.ok(Math.abs(expected[offset]-expected[offset+2])>80);assert.equal(Math.sign(actual[offset]-actual[offset+2]),Math.sign(expected[offset]-expected[offset+2]),'Top/bottom color markers must not rotate or flip');}
 assert.ok(Math.abs(result.durationSec-8)<.15);assert.equal(result.publicationApproved,false);
 assert.equal(hash(await readFile(source)),original);
});
