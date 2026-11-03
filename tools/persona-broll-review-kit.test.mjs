import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Script} from 'node:vm';
import {buildBrollReviewHtml,prepareBrollReviewKit} from './persona-broll-review-kit.mjs';

const toolsReady=['ffmpeg','ffprobe'].every(x=>spawnSync(x,['-version'],{encoding:'utf8'}).status===0);
const sha=x=>createHash('sha256').update(x).digest('hex');
async function inputFixture(root,{real=false,validCandidate=true}={}){
 const inbox=join(root,'inbox');await mkdir(inbox);
 const source=join(inbox,'train.mp4');
 if(real){
  const c=spawnSync('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y',
   '-f','lavfi','-i','testsrc2=s=320x568:r=25','-f','lavfi','-i',
   'sine=frequency=440:sample_rate=48000','-t','2.2',
   '-c:v','mpeg4','-c:a','aac','-shortest',source],{encoding:'utf8',timeout:30000});
  assert.equal(c.status,0,c.stderr);
 }else await writeFile(source,Buffer.from('fake-movie-for-negative-preflight'));
 const data=await readFile(source),sum=sha(data);
 const catalog={version:1,kind:'persona-local-library-v1',root:inbox,
  generatedAt:'2026-11-03T18:00:00.000Z',assets:[{
   id:'sha256:'+sum,sourcePath:source,sha256:sum,bytes:data.length,
   kind:'video',metadata:{durationSec:2.2},availability:'local',
  }]};
 const matches={version:1,kind:'persona-brief-local-asset-matches-v1',
  publicationApproved:false,librarySnapshotAt:catalog.generatedAt,
  shots:[{order:1,candidates:validCandidate?[{
   assetId:'sha256:'+sum,sourcePath:source,sha256:sum,
   startSec:.4,endSec:1.7,evidence:'author_annotation',matchedTerms:['поезд'],
  }]:[]},{order:2,candidates:[]}]};
 const timeline={version:1,width:240,height:320,fps:25,
  clips:[{beat:1,path:source,startSec:0,durationSec:1.1},
   {beat:2,path:source,startSec:1.1,durationSec:1.1}]};
 const captions={kind:'persona-subtitle-draft-v1',version:1,status:'needs-human-review',
  cues:[{beat:1,startMs:100,endMs:1050,text:'Первая реплика'},
   {beat:2,startMs:1150,endMs:2150,text:'Вторая реплика'}],warnings:[]};
 const paths={
  timelinePath:join(root,'timeline.json'),matchesPath:join(root,'matches.json'),
  catalogPath:join(root,'catalog.json'),captionsPath:join(root,'captions.json'),
 };
 await Promise.all([[paths.timelinePath,timeline],[paths.matchesPath,matches],
  [paths.catalogPath,catalog],[paths.captionsPath,captions]].map(([p,v])=>
   writeFile(p,JSON.stringify(v,null,2)+'\n')));
 return {paths,source,sum,root,inbox};
}
test('review page escapes untrusted filenames and cannot auto-approve publication',()=>{
 const template={kind:'persona-broll-author-selection-v1',version:1,
  publicationApproved:false,approvedForEdit:false,choices:[],timelineSha256:'a'.repeat(64)};
 const html=buildBrollReviewHtml(template,[{beat:1,candidates:[{
  id:'b1-0',assetId:'sha256:'+'a'.repeat(64),startSec:.4,durationSec:1.1,
  preview:'beat-01-candidate-01.mp4',name:'</script><script>alert(1)</script>',
  evidence:'author_annotation',matchedTerms:['поезд'],
 }]}],2);
 assert.match(html,/&lt;\/script&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/connect-src &#39;none&#39;/);
 assert.match(html,/value="skip" checked/);
 assert.match(html,/approvedForEdit:false/);
 assert.match(html,/publicationApproved:false/);
 assert.match(html,/id="watched-1"/);
 assert.match(html,/id="rights-1"/);
 assert.match(html,/broll-selection.reviewed.json/);
 const tags=[...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.equal(tags.length,2);
 new Script(tags[1][1],{filename:'persona-broll-review-browser.js'});
 assert.throws(()=>buildBrollReviewHtml({...template,approvedForEdit:true},[],2),
  /Safe unapproved template/);
});
test('refuses missing candidate, refuses changed indexed source before creating review folder',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-broll-review-blocked-'));
 try{
  const f=await inputFixture(root,{validCandidate:false});
  await assert.rejects(prepareBrollReviewKit({...f.paths,outputDir:join(root,'empty')}),
   /No valid local video/);
  await assert.rejects(stat(join(root,'empty')),/ENOENT/);
  const g=await inputFixture(join(root,'second')).catch(async e=>{
   // The fixture root must exist to test a separate indexed source.
   await mkdir(join(root,'second'));
   return inputFixture(join(root,'second'));
  });
  await writeFile(g.source,Buffer.from('modified-after-index'));
  await assert.rejects(prepareBrollReviewKit({...g.paths,outputDir:join(root,'tampered')}),
   /changed|Original SHA|Original moved/i);
  await assert.rejects(stat(join(root,'tampered')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('real FFmpeg creates playable offline candidate MP4; HTML and selection stay unapproved',{skip:!toolsReady},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-broll-review-real-'));
 try{
  const f=await inputFixture(root,{real:true}),before=sha(await readFile(f.source));
  const result=await prepareBrollReviewKit({...f.paths,outputDir:join(root,'new-review')});
  assert.equal(result.status,'AWAITING_AUTHOR_BROLL_SELECTION');
  assert.equal(result.previewCount,1);
  assert.equal(result.publicationApproved,false);
  assert.equal(result.originalMediaUnchanged,true);
  const tpl=JSON.parse(await readFile(result.selectionTemplate,'utf8'));
  assert.equal(tpl.approvedForEdit,false);
  assert.equal(tpl.choices[0].authorReviewed,false);
  const html=await readFile(result.reviewHtml,'utf8');
  assert.match(html,/beat-01-candidate-01\.mp4/);
  assert.match(html,/скач/i);
  assert.match(html,/Я подтверждаю права/);
  const media=join(root,'new-review','beat-01-candidate-01.mp4');
  assert.ok((await stat(media)).size>1000);
  const info=spawnSync('ffprobe',['-v','error','-show_entries',
   'format=duration:stream=codec_type,codec_name','-of','json',media],
   {encoding:'utf8',timeout:20000});
  assert.equal(info.status,0,info.stderr);
  const parsed=JSON.parse(info.stdout);
  assert.equal(parsed.streams.find(s=>s.codec_type==='video').codec_name,'h264');
  assert.ok(Number(parsed.format.duration)>.7);
  const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-i',
   media,'-f','null','-'],{encoding:'utf8',timeout:20000});
  assert.equal(decoded.status,0,decoded.stderr);
  assert.equal(sha(await readFile(f.source)),before);
 }finally{await rm(root,{recursive:true,force:true})}
});
