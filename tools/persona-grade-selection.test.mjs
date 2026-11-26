import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {gradeSampleFilter,chooseComparedGrade,selectLocalGrade} from './persona-grade-selection.mjs';
const scores={naturalColor:4,highlightDetail:4,shadowDetail:4,texture:3,brandFit:4};
const opinion=(patch={},uncertain=false)=>({variants:[{id:'SoftCinematic',uncertain:false,scores},{id:'DetailCinematic',uncertain,scores:{...scores,...patch}}],reason:'Сравнение'});
test('grade choice requires improvement without regression in both frames',()=>{
 const improved=opinion({texture:4});
 assert.equal(chooseComparedGrade('SoftCinematic',[improved,improved]).selected,'DetailCinematic');
 for(const other of [opinion({naturalColor:3}),opinion({},true)])assert.equal(chooseComparedGrade('SoftCinematic',[improved,other]).selected,'SoftCinematic');
 assert.equal(chooseComparedGrade('SoftCinematic',[opinion(),opinion()]).selected,'SoftCinematic');
 assert.throws(()=>gradeSampleFilter('arbitrary-filter'));
});
test('real FFmpeg comparison images use production filters and preserve sample hashes',{skip:spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status!==0},async()=>{
 const out=await mkdtemp(join(tmpdir(),'persona-grade-test-'));
 try{
  const source=join(out,'source.mp4');
  const run=args=>{const r=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error',...args],{maxBuffer:2*1024*1024});assert.equal(r.status,0,String(r.stderr));return r.stdout};
  run(['-f','lavfi','-i','testsrc2=s=320x240:r=25:d=3','-c:v','libx264','-pix_fmt','yuv420p',source]);
  const hash=b=>createHash('sha256').update(b).digest('hex'),original=hash(await readFile(source));
  const receipt=await selectLocalGrade({baseline:'SoftCinematic',samples:[{fileIndex:0,atSec:.5,sourceSha256:original},{fileIndex:0,atSec:2,sourceSha256:original}],out,model:'fixture-vision',
   fetchImpl:async()=>({ok:true,json:async()=>({capabilities:['vision']})}),
   renderFrame:async(s,filter)=>run(['-ss',String(s.atSec),'-i',source,'-frames:v','1','-vf',filter,'-q:v','5','-f','image2pipe','-vcodec','mjpeg','pipe:1']),
   review:async()=>opinion({texture:4})});
  assert.equal(receipt.evidence.length,4);assert.equal(receipt.publicationApproved,false);
  assert.equal(receipt.selected,'DetailCinematic');
  for(const e of receipt.evidence)assert.equal(hash(await readFile(join(out,e.file))),e.sha256);
  assert.notEqual(receipt.evidence[0].sha256,receipt.evidence[1].sha256);
  assert.equal(hash(await readFile(source)),original);
 }finally{await rm(out,{recursive:true,force:true})}
});
