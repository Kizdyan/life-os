#!/usr/bin/env node
/**
 * Persona video QA fixture: creates one synthetic 9:16 MP4.
 * Offline: system FFmpeg/ffprobe; no user assets or external code.
 * This is an FFmpeg baseline, NOT proof of Remotion integration.
 * Usage: node scripts/persona-synthetic-video-pilot.mjs output.mp4
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

function run(command, args, timeout = 120000) {
  const result = spawnSync(command, args, {encoding:'utf8', timeout, maxBuffer: 10_000_000});
  if(result.error) throw result.error;
  if(result.status !== 0) throw new Error(command + ' failed: ' + (result.stderr||'').slice(-2400));
  return result;
}
function rate(value) {const [a,b]=String(value).split('/').map(Number); return b? a/b : a;}
function loudness(file) {
  const result = run('ffmpeg',['-hide_banner','-i',file,'-af','loudnorm=I=-16:TP=-2:LRA=7:print_format=json','-f','null','-']);
  const found=result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if(!found) throw new Error('No measured loudness result');
  const parsed=JSON.parse(found[0]);
  const integratedLufs=Number(parsed.input_i);
  const truePeakDbfs=Number(parsed.input_tp);
  if(!Number.isFinite(integratedLufs)||!Number.isFinite(truePeakDbfs))throw new Error('Invalid loudness metrics');
  return {integratedLufs,truePeakDbfs};
}
async function sha256(file) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest('hex');
}
export async function renderSyntheticPilot(output) {
  const file=resolve(output);
  const filter=[
    '[0:v]format=yuv420p,drawtext=text=TAKE_01:fontcolor=white:fontsize=60:x=(w-text_w)/2:y=120[v0]',
    '[2:v]hue=h=60,format=yuv420p,drawtext=text=TAKE_02:fontcolor=white:fontsize=60:x=(w-text_w)/2:y=120[v1]',
    '[v0][1:a][v1][3:a]concat=n=2:v=1:a=1[v][a]',
    '[a]loudnorm=I=-16:TP=-2:LRA=7[an]',
  ].join(';');
  run('ffmpeg',[
    '-hide_banner','-loglevel','error','-y',
    '-f','lavfi','-i','testsrc=size=720x1280:rate=30:duration=2',
    '-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
    '-f','lavfi','-i','testsrc=size=720x1280:rate=30:duration=2',
    '-f','lavfi','-i','sine=frequency=660:sample_rate=48000:duration=2',
    '-filter_complex',filter,'-map','[v]','-map','[an]',
    '-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p',
    '-c:a','aac','-b:a','128k','-movflags','+faststart',file,
  ]);
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]).stdout);
  const video=probe.streams.find(s=>s.codec_type==='video');
  const audio=probe.streams.find(s=>s.codec_type==='audio');
  if(!video||!audio)throw new Error('Missing output video/audio streams');
  const measured=loudness(file);
  const evidence={
    measuredFromRenderedFile:true,outputSha256:await sha256(file),
    width:video.width,height:video.height,fps:rate(video.avg_frame_rate),
    durationSeconds:Number(probe.format.duration),hasAudio:true,
    integratedLufs:measured.integratedLufs,truePeakDbfs:measured.truePeakDbfs,
    captionSyncP95Ms:null,captionsRequired:false,
    renderErrors:0,blackOrFrozenFrames:null,visibleArtifacts:null,
    identityPreserved:null,paletteApproved:null,mediaRightsCleared:true,
  };
  const report={schemaVersion:1,fixture:'synthetic_two_take_ffmpeg',notRemotion:true,
    source:'ffmpeg generated moving test patterns plus locally generated sine tone',
    outputFile:file.split('/').pop(),
    evidence,pending:['black/frozen frame inspection','human visual review',
      'identity and palette review','integration with assessPersonaReelExport',
      'actual Remotion-based A/B test'],
  };
  await writeFile(file+'.qa.json',JSON.stringify(report,null,2)+'\n');
  return report;
}
if(process.argv[1] && import.meta.url===new URL('file://'+resolve(process.argv[1])).href) {
  if(process.argv.length!==3){
    console.error('Usage: node scripts/persona-synthetic-video-pilot.mjs output.mp4');process.exitCode=2;
  } else renderSyntheticPilot(process.argv[2]).then(r=>process.stdout.write(JSON.stringify(r,null,2)+'\n'))
    .catch(e=>{console.error(e.message);process.exitCode=1;});
}
