#!/usr/bin/env node
/** Read-only MP4 evidence -> existing core Persona Reel QA gate.
 * Usage: node --experimental-strip-types scripts/persona-video-qa.mjs video.mp4 [report.json]
 * Never publishes or approves identity, visual quality, captions or licensing.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {measurePersonaVideo} from './persona-video-measure.mjs';
import {assessPersonaReelExport} from '../packages/core/src/media-export-qa.ts';

export async function assessLocalPersonaVideo(input) {
  const measured=await measurePersonaVideo(input);
  // Assume captions are required for this Reel QA workflow unless separately
  // reviewed; subtitle timing is never invented from the video container.
  const evidence={...measured.evidence,captionsRequired:true};
  const qa=assessPersonaReelExport(evidence);
  return {...measured,evidence,qa,publishAllowed:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if(process.argv.length<3||process.argv.length>4) {
    console.error('Usage: node --experimental-strip-types scripts/persona-video-qa.mjs <input.mp4> [report.json]');
    process.exitCode=2;
  } else assessLocalPersonaVideo(process.argv[2]).then(async report=>{
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.argv[3]) await writeFile(resolve(process.argv[3]),json,{flag:'wx'});
    else process.stdout.write(json);
    if(report.qa.status==='fail') process.exitCode=1;
  }).catch(error=>{console.error(error.message);process.exitCode=2;});
}
