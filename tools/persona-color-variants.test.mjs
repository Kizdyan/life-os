import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,stat,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createColorVariants} from './persona-color-variants.mjs';

const available=spawnSync('ffmpeg',['-version']).status===0&&spawnSync('ffprobe',['-version']).status===0;
async function withTemp(run){
 const root=await mkdtemp(join(tmpdir(),'persona-color-variants-'));
 try{return await run(root)}finally{await rm(root,{recursive:true,force:true})}
}
function makeSample(output,extra=[]){
 const result=spawnSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=s=320x568:r=30:d=1',
  '-f','lavfi','-i','sine=frequency=440:duration=1','-c:v','libx264','-c:a','aac',
  ...extra,'-shortest',output],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
}
test('creates three SHA-bound, non-destructive color variants with unchanged audio',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const source=join(root,'original.mp4'),out=join(root,'variants');
 makeSample(source);
 const before=await readFile(source);
 const result=await createColorVariants({inputPath:source,outputDir:out});
 assert.equal(result.variants.length,3);
 assert.equal(result.publicationApproved,false);
 assert.deepEqual(await readFile(source),before);
 const saved=JSON.parse(await readFile(join(out,'COMPARISON.json'),'utf8'));
 assert.deepEqual(saved,result);
 assert.equal(new Set(result.variants.map(v=>v.sha256)).size,3);
 for(const variant of result.variants){
  assert.ok((await stat(variant.path)).size>1000);
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height',
   '-of','json',variant.path],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  const streams=JSON.parse(probe.stdout).streams;
  assert.ok(streams.some(stream=>stream.codec_type==='video'&&stream.width===320&&stream.height===568));
  assert.ok(streams.some(stream=>stream.codec_type==='audio'));
 }
 await assert.rejects(createColorVariants({inputPath:source,outputDir:out}),/outputDir already exists/);
}));
test('HDR/BT.2020 input is rejected before creation of output directory',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const input=join(root,'hdr-marked.mp4'),out=join(root,'should-not-exist');
 makeSample(input,['-color_trc','smpte2084','-color_primaries','bt2020']);
 const probe=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries',
  'stream=color_transfer,color_primaries','-of','json',input],{encoding:'utf8'});
 assert.equal(probe.status,0,probe.stderr);
 assert.ok(probe.stdout.includes('smpte2084')||probe.stdout.includes('bt2020'));
 await assert.rejects(createColorVariants({inputPath:input,outputDir:out}),/HDR or BT.2020/);
 await assert.rejects(access(out),{code:'ENOENT'});
}));
test('CLI can render a complete comparison folder without editing the source',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const source=join(root,'original.mp4'),out=join(root,'cli-variants');
 makeSample(source);
 const script=fileURLToPath(new URL('./persona-color-variants.mjs',import.meta.url));
 const run=spawnSync(process.execPath,[script,source,out],{encoding:'utf8',timeout:120000});
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/Created 3 verified color variants/);
 const manifest=JSON.parse(await readFile(join(out,'COMPARISON.json'),'utf8'));
 assert.equal(manifest.variants.length,3);
}));
