import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('Persona renders a non-silent soundtrack into an MP4',{timeout:180000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-music-'));
 try{
  const video=join(dir,'source.mp4'),music=join(dir,'music.mp3'),project=join(dir,'project.json'),out=join(dir,'out.mp4');
  const run=(cmd,args)=>{const p=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});assert.equal(p.status,0,p.stderr);return p.stdout};
  run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x240:r=25','-f','lavfi','-i','sine=frequency=220:sample_rate=48000','-t','1','-c:v','mpeg4','-c:a','aac',video]);
  run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440','-t','2','-c:a','libmp3lame',music]);
  await writeFile(project,JSON.stringify({version:1,width:320,height:480,fps:25,clips:[{path:video,durationSec:0.6},{path:video,durationSec:0.6}],soundtrack:{path:music,startSec:0.2,volume:0.8,originalVolume:1}}));
  run(process.execPath,['tools/persona-timeline-render.mjs',project,out]);
  const metadata=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',out]));
  assert.ok(metadata.streams.some(s=>s.codec_type==='audio'));
  assert.ok(Math.abs(Number(metadata.format.duration)-1.2)<0.25);
  const decoded=spawnSync('ffmpeg',['-v','error','-i',out,'-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'],{maxBuffer:1024*1024});
  assert.equal(decoded.status,0);
  let peak=0;for(let i=0;i+1<decoded.stdout.length;i+=2)peak=Math.max(peak,Math.abs(decoded.stdout.readInt16LE(i)));
  assert.ok(peak>100,'Exported audio is silent');
  assert.ok(peak<32767,'Exported audio must not clip at full scale');
  const samples=new Float64Array(Math.floor(decoded.stdout.length/2));
  for(let i=0;i<samples.length;i++)samples[i]=decoded.stdout.readInt16LE(i*2)/32768;
  const tonePower=hz=>{let re=0,im=0;for(let i=0;i<samples.length;i++){const phase=2*Math.PI*hz*i/8000;re+=samples[i]*Math.cos(phase);im+=samples[i]*Math.sin(phase)}return Math.hypot(re,im)/samples.length};
  assert.ok(tonePower(220)>0.001,'Original source audio was lost in the mix');
  assert.ok(tonePower(440)>0.001,'Music soundtrack was lost in the mix');
  const manifest=JSON.parse(await readFile(out+'.persona.json','utf8'));
  assert.equal(manifest.soundtrack.volume,0.8);
  assert.equal(manifest.soundtrack.originalVolume,1);
  assert.equal(manifest.soundtrack.startSec,0.2);
 }finally{await rm(dir,{recursive:true,force:true})}
});
