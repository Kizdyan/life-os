#!/usr/bin/env node
/**
 * Safe, dependency-free Persona CapCut handoff generator.
 * Produces a neutral timeline JSON and SRT; does NOT generate CapCut drafts,
 * execute CapCut, modify original media, call external services or publish.
 * Node 20+.
 */
import { readFile, mkdir, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const safeMs = n => Number.isSafeInteger(n) && n >= 0 && n <= 86_400_000;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object,key);
function ensureText(s, label, max=1200) {
  if (typeof s !== 'string' || !s.trim() || s.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s)) throw Error(`Invalid ${label}`);
  return s;
}
function srtTime(ms) {
  const h = Math.floor(ms/3_600_000); ms %= 3_600_000;
  const m = Math.floor(ms/60_000); ms %= 60_000;
  const s = Math.floor(ms/1000); const r = ms % 1000;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(r).padStart(3,'0')}`;
}
export function createCapcutHandoff(workPackage, assets) {
  if (!workPackage || workPackage.version !== 1 || workPackage.approvalRequired !== true) throw Error('Expected v1 CapCutWorkPackage with approvalRequired:true');
  if (!['9:16','16:9','1:1','4:5'].includes(workPackage.aspectRatio)) throw Error('Unsupported aspect ratio');
  ensureText(workPackage.projectId,'projectId',160);
  if (!['instagram','youtube','other'].includes(workPackage.channel)) throw Error('Invalid channel');
  if (!Array.isArray(workPackage.clips) || workPackage.clips.length === 0 || workPackage.clips.length > 100) throw Error('Expected 1–100 approved clips');
  if (!assets || typeof assets !== 'object' || Array.isArray(assets)) throw Error('Asset map required');
  let offset=0;
  const orders=new Set();
  const timeline=[...workPackage.clips].sort((a,b)=>a.order-b.order).map((clip,i)=>{
    ensureText(clip.assetId,'assetId',160);
    if (!own(assets,clip.assetId)) throw Error(`Missing source asset ${clip.assetId}`);
    const path=ensureText(assets[clip.assetId],`local path for ${clip.assetId}`,1500);
    if (/^(https?:|file:|data:)/i.test(path)) throw Error('Only local file paths are supported');
    if (!safeMs(clip.sourceStartMs) || !safeMs(clip.sourceEndMs) || clip.sourceEndMs<=clip.sourceStartMs) throw Error('Invalid source range');
    if (!Number.isSafeInteger(clip.order) || orders.has(clip.order)) throw Error('Duplicate or invalid clip order');
    orders.add(clip.order);
    const startMs=offset;
    offset+=clip.sourceEndMs-clip.sourceStartMs;
    return {index:i+1,order:clip.order,assetId:clip.assetId,sourcePath:path,sourceStartMs:clip.sourceStartMs,sourceEndMs:clip.sourceEndMs,timelineStartMs:startMs,timelineEndMs:offset,reason:String(clip.reason||'')};
  });
  if (offset > 86_400_000) throw Error('Timeline too long');
  if (workPackage.targetDurationMs!==null && (!safeMs(workPackage.targetDurationMs) || workPackage.targetDurationMs===0)) throw Error('Invalid target duration');
  const captions=Array.isArray(workPackage.captions)?workPackage.captions:[];
  if (captions.length > 500) throw Error('Too many captions');
  const sortedCaptions=[...captions].sort((a,b)=>a.startMs-b.startMs);
  for (const c of sortedCaptions) {
    if (!safeMs(c.startMs) || !safeMs(c.endMs) || c.endMs<=c.startMs || c.endMs>offset) throw Error('Caption outside timeline');
    ensureText(c.text,'caption text',500);
  }
  const overlays=Array.isArray(workPackage.overlays)?workPackage.overlays:[];
  for (const o of overlays) {
    if (!safeMs(o.atMs) || !safeMs(o.durationMs) || o.durationMs===0 || o.atMs+o.durationMs>offset) throw Error('Overlay outside timeline');
    if (!['hook','context','cta','label'].includes(o.role)) throw Error('Invalid overlay role');
    ensureText(o.text,'overlay text');
  }
  const srt=sortedCaptions.map((c,i)=>`${i+1}\n${srtTime(c.startMs)} --> ${srtTime(c.endMs)}\n${c.text.replace(/\r\n?/g,'\n')}\n`).join('\n');
  return {manifest:{schema:'persona-capcut-handoff-v1',status:'planning-only',capcutDraftCreated:false,renderedMp4Created:false,approvedForPublication:false,projectId:workPackage.projectId,channel:workPackage.channel,aspectRatio:workPackage.aspectRatio,timelineDurationMs:offset,clipCount:timeline.length,captionCount:sortedCaptions.length,rightsVerified:false,sourceHashesVerified:false},timeline,captions:sortedCaptions,overlays, audio:workPackage.audio||[],styleMemoryNotes:workPackage.styleMemoryNotes||[],subtitleSrt:srt};
}
async function saveHandoff(pkg, mapping, outputDir) {
  const input=JSON.parse(await readFile(pkg,'utf8'));
  const assets=JSON.parse(await readFile(mapping,'utf8'));
  const handoff=createCapcutHandoff(input,assets);
  await mkdir(outputDir,{recursive:false}); // deliberate refusal on preexisting destination
  await Promise.all([
    writeFile(join(outputDir,'manifest.json'),JSON.stringify(handoff.manifest,null,2)+'\n',{flag:'wx'}),
    writeFile(join(outputDir,'timeline.json'),JSON.stringify({timeline:handoff.timeline,overlays:handoff.overlays,audio:handoff.audio,styleMemoryNotes:handoff.styleMemoryNotes},null,2)+'\n',{flag:'wx'}),
    writeFile(join(outputDir,'captions.srt'),handoff.subtitleSrt,{flag:'wx'}),
    writeFile(join(outputDir,'NEXT_STEPS.md'),'# CapCut manual handoff\n\n1. Review source paths and rights; do not upload private material.\n2. Create a new CapCut project using aspect ratio in manifest.json.\n3. Arrange local source clips in timeline.json order, using sourceStartMs/sourceEndMs.\n4. Import captions.srt and review timing/line breaks.\n5. Apply overlays, audio and style notes; preserve original appearance.\n6. Export to a NEW MP4; inspect with ffprobe/ffmpeg, watch the full edit.\n7. Obtain separate author approval before publication.\n\nThis folder is NOT a native CapCut draft.\n',{flag:'wx'})
  ]);
  return handoff.manifest;
}
async function selfTest() {
  const fixture={version:1,projectId:'persona-test',channel:'instagram',aspectRatio:'9:16',targetDurationMs:6000,hook:'Test',clips:[{assetId:'A',sourceStartMs:1000,sourceEndMs:4000,order:1,reason:'First'},{assetId:'B',sourceStartMs:0,sourceEndMs:3000,order:2,reason:'Second'}],captions:[{startMs:0,endMs:1200,text:'Привет'},{startMs:3400,endMs:5900,text:'Пока'}],overlays:[{atMs:0,durationMs:800,text:'Хук',role:'hook'}],audio:[],styleMemoryNotes:[],approvalRequired:true};
  const map={A:'C:\\Persona\\A.mp4',B:'C:\\Persona\\B.mp4'};
  const r=createCapcutHandoff(fixture,map);
  assert.equal(r.timeline.length,2);
  assert.equal(r.manifest.timelineDurationMs,6000);
  assert.equal(r.timeline[1].timelineStartMs,3000);
  assert.match(r.subtitleSrt,/00:00:03,400 --> 00:00:05,900/);
  assert.equal(r.manifest.capcutDraftCreated,false);
  assert.equal(r.manifest.approvedForPublication,false);
  assert.throws(()=>createCapcutHandoff({...fixture,clips:[{...fixture.clips[0],assetId:'X'}]},map),/Missing source asset/);
  assert.throws(()=>createCapcutHandoff({...fixture,clips:[{...fixture.clips[0],sourceEndMs:900}]},map),/Invalid source range/);
  assert.throws(()=>createCapcutHandoff({...fixture,captions:[{startMs:0,endMs:8000,text:'bad'}]},map),/outside timeline/);
  assert.throws(()=>createCapcutHandoff({...fixture,approvalRequired:false},map),/approvalRequired/);
  const dir=await mkdtemp(join(tmpdir(),'capcut-handoff-test-'));
  try {
    const p=join(dir,'package.json'), a=join(dir,'assets.json'), out=join(dir,'new-output');
    await writeFile(p,JSON.stringify(fixture));await writeFile(a,JSON.stringify(map));
    await saveHandoff(p,a,out);
    assert.deepEqual((await readdir(out)).sort(),['NEXT_STEPS.md','captions.srt','manifest.json','timeline.json']);
    await assert.rejects(()=>saveHandoff(p,a,out),/EEXIST/);
    assert.deepEqual((await readdir(dir)).sort(),['assets.json','new-output','package.json']);
  } finally {await rm(dir,{recursive:true,force:true});}
  process.stdout.write('PASS 13 CapCut handoff checks; no native draft, no render, no publication\n');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if (process.argv[2]==='--self-test') selfTest().catch(e=>{console.error(e);process.exitCode=1;});
  else if (process.argv.length!==5) {console.error('Usage: node scripts/capcut-handoff.mjs <work-package.json> <asset-map.json> <NEW-output-dir> | --self-test');process.exitCode=2;}
  else saveHandoff(resolve(process.argv[2]),resolve(process.argv[3]),resolve(process.argv[4])).then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n')).catch(e=>{console.error(e.message);process.exitCode=1;});
}