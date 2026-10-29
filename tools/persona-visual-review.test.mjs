import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateTimeline,applyManualFraming,makeVisualHtml,prepareVisualReview,applyVisualReview} from './persona-visual-review.mjs';

const sha=n=>n.repeat(64);
const baseTimeline={version:1,clips:[
 {path:join(process.cwd(),'safe','a.mp4'),beat:1,startSec:0.1,durationSec:1.5},
 {path:join(process.cwd(),'safe','b.mp4'),beat:2,startSec:0.2,durationSec:1.3}
]};
function fixturePack(timeline=baseTimeline){
 return {version:1,kind:'persona-visual-review-pack-v1',timelinePath:join(process.cwd(),'safe','timeline.json'),
 scenes:timeline.clips.map((c,i)=>({beat:c.beat,path:c.path,startSec:c.startSec,
  durationSec:c.durationSec,sourceSha256:sha(i?'b':'a'),
  sourceLabel:'clip.mp4',frames:[1,2,3].map(j=>({file:'f'+j+'.jpg',yavg:100})),warnings:[]}))};
}
function approvedReview(pack){
 return {version:1,kind:'persona-visual-framing-selection-v1',publicationApproved:false,
 scenes:pack.scenes.map(s=>({beat:s.beat,sourceSha256:s.sourceSha256,
  framing:{mode:'cover',position:{x:.75,y:.25}},reviewed:true,reason:'Оставляю лицо и клавиши в кадре'}))};
}
test('manual framing modifies a NEW timeline object without touching originals or approving publication',()=>{
 const before=structuredClone(baseTimeline),pack=fixturePack(),sel=approvedReview(pack);
 const derived=applyManualFraming(pack,sel,baseTimeline);
 assert.deepEqual(baseTimeline,before);
 assert.deepEqual(derived.clips[0].framing,{mode:'cover',position:{x:.75,y:.25}});
 assert.equal(derived.visualReview.publicationApproved,false);
 assert.equal(derived.clips.length,2);
});
test('reject forged approval, stale clips, unchecked choices and invalid crop',()=>{
 const pack=fixturePack(),sel=approvedReview(pack);
 assert.throws(()=>applyManualFraming(pack,{...sel,approved:true},baseTimeline),/approval guard/);
 const stale=structuredClone(baseTimeline);stale.clips[1].startSec=1.5;
 assert.throws(()=>applyManualFraming(pack,sel,stale),/same clip/);
 const unreviewed=structuredClone(sel);unreviewed.scenes[0].reviewed=false;
 assert.throws(()=>applyManualFraming(pack,unreviewed,baseTimeline),/must be reviewed/);
 const invalid=structuredClone(sel);invalid.scenes[0].framing.position.x=2;
 assert.throws(()=>applyManualFraming(pack,invalid,baseTimeline),/Invalid crop/);
 const reversed=structuredClone(baseTimeline);reversed.clips[1].beat=1;
 assert.throws(()=>validateTimeline(reversed),/reordered/);
});
test('offline visual page has crop sliders and escapes untrusted source names',()=>{
 const pack=fixturePack();pack.scenes[0].sourceLabel='<img src=x onerror=alert(1)>';
 const html=makeVisualHtml(pack);
 assert.match(html,/type="range"/);
 assert.match(html,/visual-framing\.reviewed\.json/);
 assert.match(html,/objectPosition/);
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
 assert.match(html,/Публикация не разрешается/);
});
const ready=['ffmpeg','ffprobe'].every(bin=>spawnSync(bin,['-version'],{encoding:'utf8'}).status===0);
test('synthetic videos: real FFmpeg stills, luma continuity warnings, manual crop, source integrity',{skip:!ready,timeout:180000},async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-visual-'));
 try{
  const paths=[join(root,'bright.mp4'),join(root,'dark.mp4')];
  for(const [idx,path] of paths.entries()){
   const v=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i',
    'color=c='+(idx?'black':'white')+':s=320x240:r=30',
    '-t','3','-c:v','mpeg4',path],{encoding:'utf8',timeout:30000});
   assert.equal(v.status,0,v.stderr);
  }
  const originals=await Promise.all(paths.map(p=>readFile(p)));
  const timelinePath=join(root,'timeline.json'),outputDir=join(root,'visual');
  const timeline={version:1,width:1080,height:1920,fps:30,
   clips:paths.map((path,i)=>({beat:i+1,path,startSec:.1,durationSec:2.5}))};
  await writeFile(timelinePath,JSON.stringify(timeline));
  const prepared=await prepareVisualReview(timelinePath,outputDir);
  assert.equal(prepared.scenes,2);
  assert.equal(prepared.continuityWarnings,1);
  const pack=JSON.parse(await readFile(prepared.packPath,'utf8'));
  assert.equal(pack.scenes[0].frames.length,3);
  assert.equal(pack.scenes[1].frames.length,3);
  assert.ok(pack.scenes[0].frames[1].yavg>pack.scenes[1].frames[1].yavg);
  for(const scene of pack.scenes)for(const f of scene.frames)
   assert.ok((await stat(join(outputDir,f.file))).size>100);
  const decisionsPath=join(root,'chosen.json');
  await writeFile(decisionsPath,JSON.stringify(approvedReview(pack)));
  const derivedPath=join(root,'framed-timeline.json');
  await applyVisualReview({timelinePath,packPath:prepared.packPath,
   selectionPath:decisionsPath,outputPath:derivedPath});
  assert.equal(JSON.parse(await readFile(derivedPath,'utf8')).clips[1].framing.mode,'cover');
  for(const [idx,path] of paths.entries())assert.deepEqual(await readFile(path),originals[idx]);
  await assert.rejects(()=>applyVisualReview({timelinePath,packPath:prepared.packPath,
   selectionPath:decisionsPath,outputPath:derivedPath}),/EEXIST/);
  await writeFile(paths[0],'changed');
  await assert.rejects(()=>applyVisualReview({timelinePath,packPath:prepared.packPath,
   selectionPath:decisionsPath,outputPath:join(root,'danger.json')}),/changed after visual/);
 }finally{await rm(root,{recursive:true,force:true})}
});
