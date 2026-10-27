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
  const run=(cmd,args)=>{const p=spawnSync(cmd,args,{encoding:'utf8',timeout:120000});assert.equal(p.status,0,p.stderr);return p.stdout};
  run('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x240:r=25','-t','1','-c:v','mpeg4',video]);
  run('ffmpeg',['-v','error','-f','lavfi','-i','sine=frequency=440','-t','2','-c:a','libmp3lame',music]);
  await writeFile(project,JSON.stringify({version:1,width:320,height:480,fps:25,clips:[{path:video,durationSec:0.6},{path:video,durationSec:0.6}],soundtrack:{path:music,volume:0.8}}));
  run(process.execPath,['tools/persona-timeline-render.mjs',project,out]);
  const metadata=JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',out]));
  assert.ok(metadata.streams.some(s=>s.codec_type==='audio'));
  assert.ok(Math.abs(Number(metadata.format.duration)-1.2)<0.25);
  const decoded=spawnSync('ffmpeg',['-v','error','-i',out,'-vn','-ac','1','-ar','8000','-f','s16le','pipe:1'],{maxBuffer:1024*1024});
  assert.equal(decoded.status,0);
  let peak=0;for(let i=0;i+1<decoded.stdout.length;i+=2)peak=Math.max(peak,Math.abs(decoded.stdout.readInt16LE(i)));
  assert.ok(peak>100,'Exported audio is silent');
  const manifest=JSON.parse(await readFile(out+'.persona.json','utf8'));
  assert.equal(manifest.soundtrack.volume,0.8);
 }finally{await rm(dir,{recursive:true,force:true})}
});
