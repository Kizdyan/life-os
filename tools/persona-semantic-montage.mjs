#!/usr/bin/env node
/**
 * Persona semantic montage handoff: evidence -> reviewed edit decisions -> existing renderer.
 * analyze <sources.json> <new-output-directory>
 * assemble <decisions.json> <new-render-project.json>
 * No network, API keys, silent overwrite, AI claims or media uploads.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectTake } from './persona-take-qa.mjs';

const exts = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
const MAX_INPUTS = 12;
const MAX_BYTES = 2 * 1024 ** 3;
const FFMPEG = process.env.PERSONA_FFMPEG || 'ffmpeg';
const FFPROBE = process.env.PERSONA_FFPROBE || 'ffprobe';
const assert = (condition, message) => { if (!condition) throw Error(message); };
const finite = (n, min, max) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
const own = (object, field) => Object.prototype.hasOwnProperty.call(object, field);
const absolute = (base, path) => isAbsolute(path) ? resolve(path) : resolve(base, path);
async function readJson(path) { return JSON.parse(await readFile(path, 'utf8')); }
function invoke(bin, args, { maxBytes = 1024 * 1024, captureError = false } = {}) {
  return new Promise((ok, bad) => {
    const p = spawn(bin, args, { shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    const chunks = []; let bytes = 0, err = '', done = false;
    function reject(error) { if (!done) { done = true; p.kill(); bad(error); } }
    p.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) reject(Error('Process stdout exceeded safety limit'));
      else chunks.push(chunk);
    });
    p.stderr.on('data', chunk => { err = (err + chunk).slice(-200000); });
    p.on('error', reject);
    p.on('close', code => {
      if (done) return;
      done = true;
      if (code !== 0) bad(Error(bin + ' exited ' + code + ': ' + err.slice(-1000)));
      else ok(captureError ? err : Buffer.concat(chunks).toString('utf8'));
    });
  });
}
async function sha256(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}
async function mediaInfo(path) {
  const value = JSON.parse(await invoke(FFPROBE,['-v','error','-show_entries','format=duration:stream=codec_type,width,height,avg_frame_rate','-of','json',path]));
  const video = value.streams?.find(stream => stream.codec_type === 'video');
  const durationSec = Number(value.format?.duration);
  assert(video?.width > 0 && video?.height > 0 && finite(durationSec,0.1,180), 'Invalid or oversized video input');
  return { durationSec, width:video.width, height:video.height, hasAudio:!!value.streams?.some(s=>s.codec_type==='audio') };
}
async function analyze(inputArg, outputArg) {
  const input = resolve(inputArg), base = dirname(input);
  const request = await readJson(input);
  assert(request?.version === 1 && Array.isArray(request.sources) && request.sources.length >= 1 && request.sources.length <= MAX_INPUTS, 'Expected 1–12 source clips');
  const ids = new Set(); const sources = [];
  for (const entry of request.sources) {
    assert(typeof entry?.id==='string' && /^[A-Za-z0-9_-]{1,48}$/.test(entry.id) && !ids.has(entry.id), 'Invalid or repeated source ID');
    assert(typeof entry.path === 'string' && entry.path.trim(), 'Missing clip source path');
    ids.add(entry.id);
  }
  for (const entry of request.sources) {
    const path = await realpath(absolute(base,entry.path));
    assert(exts.has(extname(path).toLowerCase()), 'Unsupported source extension');
    const file = await stat(path);
    assert(file.isFile() && file.size > 0 && file.size <= MAX_BYTES, 'Source exceeds file safety limits');
    const info = await mediaInfo(path);
    sources.push({id:entry.id,path,bytes:file.size,sha256:await sha256(path),...info,technicalQuality:await inspectTake({path,...info})});
  }
  const output = resolve(outputArg);
  await mkdir(output, {recursive:false});
  try {
    for (const source of sources) {
      source.frames = [];
      for (const [index, fraction] of [0.2,0.5,0.8].entries()) {
        const timeSec = Number((source.durationSec*fraction).toFixed(3));
        const frame = source.id + '-' + (index + 1) + '.jpg';
        await invoke(FFMPEG,['-nostdin','-hide_banner','-loglevel','error','-ss',String(timeSec),'-i',source.path,'-frames:v','1','-vf','scale=w=480:h=480:force_original_aspect_ratio=decrease','-q:v','5',join(output,frame)]);
        source.frames.push({timeSec,path:join(output,frame)});
      }
      if (source.hasAudio) {
        source.audioPath=join(output,source.id+'-speech.wav');
        await invoke(FFMPEG,['-nostdin','-hide_banner','-loglevel','error','-i',source.path,'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',source.audioPath]);
        const silence = await invoke(FFMPEG,['-nostdin','-hide_banner','-i',source.path,'-vn','-af','silencedetect=noise=-35dB:d=0.35','-f','null','-'],{captureError:true});
        source.silenceEvents=silence.split('\n').filter(line=>/silence_(start|end):/.test(line)).slice(0,100).map(line=>line.trim().slice(-180));
      }
    }
    const packet={version:1,kind:'persona-evidence-v1',sourceInput:input,sources,notice:'Frames, audio and silence metadata ONLY. No speech recognition, video comprehension, acting score, captions, editorial approval or upload has occurred.'};
    await writeFile(join(output,'analysis.json'),JSON.stringify(packet,null,2)+'\n',{flag:'wx'});
    return {analysis:join(output,'analysis.json'),sources:sources.length,stillNeeds:'Human or AI scene understanding + timed transcript + beat decisions'};
  }catch(error){
    await rm(output,{recursive:true,force:true});throw error;
  }
}
function words(line){return new Set(String(line||'').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/u).filter(x=>x.length>2));}
function sharedWords(briefLine, transcript){const expected=words(briefLine),spoken=words(transcript);if(!expected.size)return 1;return [...expected].filter(x=>spoken.has(x)).length/expected.size;}
async function assemble(decisionsArg, projectArg) {
  const decisionsFile = resolve(decisionsArg),base=dirname(decisionsFile),d=await readJson(decisionsFile);
  assert(d?.version===1 && typeof d.analysisPath==='string' && typeof d.briefPath==='string', 'Missing analysis/brief paths');
  const analysis=await readJson(absolute(base,d.analysisPath)),brief=await readJson(absolute(base,d.briefPath));
  assert(analysis?.kind==='persona-evidence-v1' && analysis.version===1 && Array.isArray(analysis.sources), 'Unrecognized analysis packet');
  assert(brief?.version===1 && brief.sourceFormat==='reel' && Array.isArray(brief.script) && brief.script.length>=2 && brief.script.length<=30, 'Invalid original Persona Reel brief');
  assert(Array.isArray(brief.shots) && brief.shots.length===brief.script.length && Array.isArray(d.choices) && d.choices.length===brief.script.length, 'Every script beat must have one timed choice');
  assert(!own(d,'approved') && !own(d,'authorApproved') && !own(d,'editorialApproved'), 'Do not import approval through decision files');
  const sources=new Map();
  for (const source of analysis.sources){
    assert(typeof source.id==='string'&&!sources.has(source.id)&&typeof source.path==='string'&&/^[a-f0-9]{64}$/.test(source.sha256), 'Invalid analysis source');
    sources.set(source.id,source);
  }
  const checkedSources=new Set(), clips=[],audit=[],usedIntervals=[];
  for(let i=0;i<d.choices.length;i++){
    const c=d.choices[i],beat=brief.script[i],shot=brief.shots[i];
    assert(c?.beat===i+1 && beat?.order===i+1 && shot?.order===i+1, 'Beat order mismatch');
    assert(typeof c.sourceId==='string' && sources.has(c.sourceId), 'Unknown source clip');
    assert(finite(c.startSec,0,180) && finite(c.durationSec,0.25,60), 'Invalid choice time range');
    assert(typeof c.reason==='string' && c.reason.trim().length>=10 && c.reason.length<=1000, 'Missing editorial cut rationale');
    assert(finite(c.confidence,0,1) && c.confidence>=0.65, 'Low confidence: manual review needed, no automatic montage');
    assert(typeof c.transcript==='string' && c.transcript.trim().length>=3 && c.transcript.length<=3000, 'Timed transcript is required before semantic edit');
    const overlap=sharedWords(beat.line,c.transcript);
    assert(overlap>=0.45, 'Beat ' + (i + 1) + ' transcript does not sufficiently match its dialogue (overlap=' + overlap.toFixed(2) + ')');
    const src=sources.get(c.sourceId);
    assert(c.startSec+c.durationSec<=src.durationSec+0.02, 'Choice exceeds recorded source duration');
    assert(!usedIntervals.some(x=>x.id===c.sourceId && Math.min(x.endSec,c.startSec+c.durationSec)-Math.max(x.startSec,c.startSec)>0.1), 'Overlapping choices from one source require manual review');
    if(!checkedSources.has(src.id)){
      const file=await stat(src.path);
      assert(file.isFile()&&file.size===src.bytes&&(await sha256(src.path))===src.sha256, 'Source modified since evidence capture');
      checkedSources.add(src.id);
    }
    usedIntervals.push({id:c.sourceId,startSec:c.startSec,endSec:c.startSec+c.durationSec});
    clips.push({path:src.path,startSec:c.startSec,durationSec:c.durationSec});
    audit.push({beat:i+1,sourceId:c.sourceId,dialogue:beat.line,transcript:c.transcript,semanticTokenCoverage:Number(overlap.toFixed(3)),confidence:c.confidence,reason:c.reason});
  }
  const output=resolve(projectArg);
  assert(extname(output).toLowerCase()==='.json', 'Render project must be JSON');
  const reviewPath=output.replace(/\.json$/i,'.review.json');
  assert(reviewPath!==output,'Review path collision');
  await access(output).then(()=>{throw Error('Output exists');},()=>{});
  await access(reviewPath).then(()=>{throw Error('Review report exists');},()=>{});
  const project={version:1,width:1080,height:1920,fps:30,clips};
  const review={version:1,kind:'persona-semantic-draft-v1',status:'needs-human-review',sourceBrief:absolute(base,d.briefPath),sourceAnalysis: absolute(base,d.analysisPath),originalSourceHashesVerified:true,notes:'Timed words/choices and rationale were supplied by a separate editor/model, not generated or validated as ground truth by this CLI. Visual, acting, sound, subtitles and publication require human review.',cuts:audit};
  await writeFile(output,JSON.stringify(project,null,2)+'\n',{flag:'wx'});
  try{await writeFile(reviewPath,JSON.stringify(review,null,2)+'\n',{flag:'wx'});}
  catch(e){await rm(output,{force:true});throw e;}
  return {project:output,review:reviewPath,clips:clips.length,durationSec:Number(clips.reduce((s,c)=>s+c.durationSec,0).toFixed(3)),next:'node tools/persona-timeline-render.mjs "'+output+'" "<new-output.mp4>"; then persona-verify-render.mjs; then human review'};
}
export { analyze,assemble,sharedWords };
if(process.argv[1] && resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
  const [operation,arg1,arg2]=process.argv.slice(2);
  if(!arg1||!arg2||!['analyze','assemble'].includes(operation)){
    console.error('Usage: node tools/persona-semantic-montage.mjs analyze <sources.json> <new-directory> | assemble <decisions.json> <new-render-project.json>');process.exitCode=2;
  }else (operation==='analyze'?analyze(arg1,arg2):assemble(arg1,arg2)).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error('Persona semantic montage:',e.message);process.exitCode=1;});
}
