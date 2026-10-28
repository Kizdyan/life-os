#!/usr/bin/env node
/** Read-only Persona MP4 inspection using FFmpeg/ffprobe; no AI or network.
 * Usage: node scripts/persona-video-measure.mjs <local-video.mp4> [report.json]
 * Evidence for assessPersonaReelExport(); human-only checks remain null.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_INPUT_BYTES = 3 * 1024 * 1024 * 1024;
const MAX_RUN_MS = 180_000;
function run(bin, args) {
  const r = spawnSync(bin, args, {encoding:'utf8', timeout:MAX_RUN_MS, maxBuffer:8_000_000});
  if (r.error) throw new Error(bin+': '+r.error.message);
  if (r.status !== 0) throw new Error(bin+': '+((r.stderr||'').slice(-1800)||'exit '+r.status));
  return r;
}
function rational(value) {
  const [a,b] = String(value??'').split('/').map(Number);
  const n = b===undefined?a:(b===0?NaN:a/b);
  return Number.isFinite(n)&&n>0?n:null;
}
async function hashFile(path) {
  const h=createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}
function extractLoudness(stderr) {
  const match=stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if(!match) throw new Error('FFmpeg loudnorm did not emit measurement JSON');
  const d=JSON.parse(match[0]);
  const integratedLufs=Number(d.input_i), truePeakDbfs=Number(d.input_tp);
  if(!Number.isFinite(integratedLufs)||!Number.isFinite(truePeakDbfs))
    throw new Error('Invalid measured loudness values');
  return {integratedLufs,truePeakDbfs};
}
function intervals(output, beginName, endName, duration) {
  const begins=[...output.matchAll(new RegExp(beginName+':\\s*([\\d.]+)','g'))]
    .map(m=>Number(m[1])).filter(Number.isFinite);
  const ends=[...output.matchAll(new RegExp(endName+':\\s*([\\d.]+)','g'))]
    .map(m=>Number(m[1])).filter(Number.isFinite);
  return begins.map((start,i)=>[
    Math.max(0,Math.min(duration,start)),
    Math.max(0,Math.min(duration,ends[i]??duration)),
  ]).filter(([start,end])=>end>start);
}
function approximateAffectedFrames(intervals,fps) {
  const sorted=intervals.slice().sort((a,b)=>a[0]-b[0]);
  let seconds=0,segment=null;
  for(const [start,end] of sorted) {
    if(!segment) segment=[start,end];
    else if(start<=segment[1]) segment[1]=Math.max(segment[1],end);
    else {seconds+=segment[1]-segment[0];segment=[start,end];}
  }
  if(segment) seconds+=segment[1]-segment[0];
  return Math.max(0,Math.ceil(seconds*fps));
}
export async function measurePersonaVideo(input) {
  const path=resolve(input);
  const s=await stat(path);
  if(!s.isFile()||s.size===0||s.size>MAX_INPUT_BYTES)
    throw new Error('Input must be a nonempty regular local file under 3 GiB');
  const probe=JSON.parse(run('ffprobe',[
    '-v','error','-show_format','-show_streams','-of','json',path,
  ]).stdout);
  const v=probe.streams?.find(s=>s.codec_type==='video');
  if(!v) throw new Error('No video stream');
  const a=probe.streams?.find(s=>s.codec_type==='audio');
  const fps=rational(v.avg_frame_rate)??rational(v.r_frame_rate);
  const durationSeconds=Number(probe.format?.duration);
  if(!fps||!Number.isFinite(durationSeconds)||durationSeconds<=0)
    throw new Error('Invalid media frame-rate or duration');
  run('ffmpeg',['-hide_banner','-nostdin','-v','error','-xerror','-i',path,'-f','null','-']);
  const black=run('ffmpeg',['-hide_banner','-nostdin','-i',path,
    '-vf','blackdetect=d=0.1:pix_th=0.1','-an','-f','null','-']);
  const frozen=run('ffmpeg',['-hide_banner','-nostdin','-i',path,
    '-vf','freezedetect=n=-50dB:d=0.5','-an','-f','null','-']);
  const detected=[
    ...intervals(black.stderr,'black_start','black_end',durationSeconds),
    ...intervals(frozen.stderr,'freeze_start','freeze_end',durationSeconds),
  ];
  const loudness=a?extractLoudness(run('ffmpeg',[
    '-hide_banner','-nostdin','-i',path,'-vn','-af',
    'loudnorm=I=-16:TP=-2:LRA=7:print_format=json','-f','null','-',
  ]).stderr):{integratedLufs:null,truePeakDbfs:null};
  const evidence={
    measuredFromRenderedFile:true,outputSha256:await hashFile(path),
    width:v.width??null,height:v.height??null,fps,durationSeconds,
    hasAudio:Boolean(a),...loudness,captionSyncP95Ms:null,
    captionsRequired:false,
    renderErrors:0,
    blackOrFrozenFrames:approximateAffectedFrames(detected,fps),
    visibleArtifacts:null,identityPreserved:null,paletteApproved:null,mediaRightsCleared:null,
  };
  return {
    schemaVersion:1,kind:'measured_local_mp4',evidence,
    limits:[
      'Black/frozen frame count is approximate and depends on FFmpeg thresholds.',
      'Captions and their synchronization have not been verified.',
      'Visual artifacts, identity, palette and asset rights require independent review.',
      'This report does not authorize publication or automatic quality approval.',
    ],
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.length<3||process.argv.length>4) {
    console.error('Usage: node scripts/persona-video-measure.mjs <input.mp4> [report.json]');
    process.exitCode=2;
  } else measurePersonaVideo(process.argv[2]).then(async report=>{
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.argv[3]) await writeFile(resolve(process.argv[3]),json,{flag:'wx'});
    else process.stdout.write(json);
  }).catch(error=>{console.error(error.message);process.exitCode=1;});
}
