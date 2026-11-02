import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,stat,access,open,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {dirname} from 'node:path';
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
function decodedAudioHash(path){
 const result=spawnSync('ffmpeg',['-v','error','-i',path,'-map','0:a:0',
  '-f','hash','-hash','sha256','-'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/^SHA256=[a-f0-9]{64}\s*$/i);
 return result.stdout.trim();
}
test('creates three SHA-bound, non-destructive color variants with unchanged audio',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const source=join(root,'original.mp4'),out=join(root,'variants');
 makeSample(source);
 const before=await readFile(source);
 const sourceAudioSha256=decodedAudioHash(source);
 const result=await createColorVariants({inputPath:source,outputDir:out});
 const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
 assert.equal(result.source.sha256,checksum(before),'manifest must bind the exact source bytes');
 assert.equal(result.variants.length,3);
 assert.equal(result.publicationApproved,false);
 assert.deepEqual(await readFile(source),before);
 assert.equal(result.source.path,join(out,'original.mp4'));
 assert.deepEqual(await readFile(result.source.path),before,'staged original must match input byte-for-byte');
 assert.deepEqual((await readdir(out)).sort(),[
  'COMPARISON.json','original.mp4','A-natural-clean.mp4','B-warm-cinematic.mp4','C-muted-filmic.mp4',
 ].sort(),'all five browser-import files must be in one output folder');
 const saved=JSON.parse(await readFile(join(out,'COMPARISON.json'),'utf8'));
 assert.deepEqual(saved,result);
 assert.equal(new Set(result.variants.map(v=>v.sha256)).size,3);
 for(const variant of result.variants){
  assert.ok((await stat(variant.path)).size>1000);
  assert.equal(variant.sha256,checksum(await readFile(variant.path)),'manifest must bind each rendered MP4');
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height',
   '-of','json',variant.path],{encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  const streams=JSON.parse(probe.stdout).streams;
  assert.ok(streams.some(stream=>stream.codec_type==='video'&&stream.width===320&&stream.height===568));
  assert.ok(streams.some(stream=>stream.codec_type==='audio'));
  assert.equal(decodedAudioHash(variant.path),sourceAudioSha256,'decoded audio must remain bit-identical');
 }
 await assert.rejects(createColorVariants({inputPath:source,outputDir:out}),/outputDir already exists/);
}));
test('HDR/BT.2020 input is rejected before creation of output directory',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const input=join(root,'hdr-marked.mp4'),out=join(root,'should-not-exist');
 makeSample(input,['-x264-params','colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc']);
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
 assert.equal(manifest.source.path,join(out,'original.mp4'));
 assert.match(run.stdout,/Select all five files from the output folder/);
}));

test('CLI uses an explicitly provided FFmpeg directory when PATH has no FFmpeg',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const source=join(root,'original.mp4'),out=join(root,'portable-cli-variants');
 makeSample(source);
 const script=fileURLToPath(new URL('./persona-color-variants.mjs',import.meta.url));
 const locator=spawnSync(process.platform==='win32'?'where.exe':'which',['ffmpeg'],{encoding:'utf8'});
 assert.equal(locator.status,0,locator.stderr);
 const ffmpegDir=dirname(locator.stdout.trim().split(/\r?\n/)[0]);
 const emptyPath=process.platform==='win32'?'C:\\Windows\\System32':'/usr/bin:/bin';
 const run=spawnSync(process.execPath,[script,source,out,ffmpegDir],{
  encoding:'utf8',timeout:120000,env:{...process.env,PATH:emptyPath},
 });
 assert.equal(run.status,0,run.stderr);
 assert.match(run.stdout,/Created 3 verified color variants/);
}));

test('rejects an oversized original before probing or creating a destination',()=>withTemp(async root=>{
 const source=join(root,'oversized.mp4'),out=join(root,'no-output');
 const handle=await open(source,'w');
 try{await handle.truncate(160*1024*1024+1)}finally{await handle.close()}
 await assert.rejects(createColorVariants({inputPath:source,outputDir:out}),/160 MB/);
 await assert.rejects(access(out),{code:'ENOENT'});
}));

test('original name collision cannot overwrite the Natural Clean render',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const source=join(root,'A-natural-clean.mp4'),out=join(root,'collision-variants');
 makeSample(source);
 const before=await readFile(source);
 const manifest=await createColorVariants({inputPath:source,outputDir:out});
 assert.equal(manifest.source.path,join(out,'SOURCE-A-natural-clean.mp4'));
 assert.deepEqual(await readFile(manifest.source.path),before);
 assert.equal(manifest.variants[0].path,join(out,'A-natural-clean.mp4'));
 assert.notEqual(manifest.variants[0].sha256,manifest.source.sha256);
 assert.equal((await readdir(out)).length,5);
}));

test('embedded subtitle tracks are refused rather than silently stripped',{skip:!available,timeout:120000},()=>withTemp(async root=>{
 const source=join(root,'source.mp4'),subtitles=join(root,'captions.srt');
 const input=join(root,'with-subtitles.mp4'),out=join(root,'no-output');
 makeSample(source);
 await writeFile(subtitles,'1\n00:00:00,000 --> 00:00:00,850\nVisible caption\n');
 const mux=spawnSync('ffmpeg',['-v','error','-i',source,'-f','srt','-i',subtitles,
  '-map','0:v:0','-map','0:a?','-map','1:s:0',
  '-c:v','copy','-c:a','copy','-c:s','mov_text',input],{encoding:'utf8'});
 assert.equal(mux.status,0,mux.stderr);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type',
  '-of','json',input],{encoding:'utf8'});
 assert.equal(probe.status,0,probe.stderr);
 assert.ok(JSON.parse(probe.stdout).streams.some(stream=>stream.codec_type==='subtitle'));
 await assert.rejects(createColorVariants({inputPath:input,outputDir:out}),/embedded subtitles would be lost/);
 await assert.rejects(access(out),{code:'ENOENT'});
}));
