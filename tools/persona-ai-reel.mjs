#!/usr/bin/env node
/**
 * ONE command, fully LOCAL:
 * 1) intake selected videos, 2) Whisper neural ASR,
 * 3) real Ollama editorial candidate selection, 4) FFmpeg render,
 * 5) technical MP4 verification, 6) review artifacts. No auto-publish.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runFirstReel,firstReelCliExitCode} from './persona-first-reel-runner.mjs';
import {getVisualPreset} from './persona-creative-director.mjs';
const allowed=new Set(['--takes','--brief','--out','--whisper-cli','--whisper-model','--ollama-model','--variation','--ffmpeg-dir','--burn-subtitles','--visual-preset','--take-bindings']);
export function readPersonaAiReelArgs(args){
 const parsed={};
 if(args.length%2!==0)throw Error('Flags must be followed by values');
 for(let i=0;i<args.length;i+=2){
  if(!allowed.has(args[i])||Object.hasOwn(parsed,args[i])||
   !args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid or duplicate argument: '+args[i]);
  parsed[args[i]]=args[i+1];
 }
 const required=['--takes','--brief','--out','--whisper-cli','--whisper-model','--ollama-model'];
 if(required.some(k=>typeof parsed[k]!=='string'||!parsed[k].trim()))
  throw Error('Missing '+required.filter(k=>!parsed[k]).join(', '));
 const variation=parsed['--variation']??'cinematic';
 if(parsed['--visual-preset']!==undefined)getVisualPreset(parsed['--visual-preset']);
 if(parsed['--burn-subtitles']!==undefined&&!['true','false'].includes(parsed['--burn-subtitles']))throw Error('Invalid --burn-subtitles (true|false)');
 if(!['cinematic','humor','intimate','unexpected'].includes(variation))
  throw Error('Invalid --variation (cinematic|humor|intimate|unexpected)');
 return {
  takeBindingsPath:parsed['--take-bindings']??null,sources:parsed['--takes'],brief:parsed['--brief'],outputDir:parsed['--out'],
  whisperCli:parsed['--whisper-cli'],whisperModel:parsed['--whisper-model'],
  aiEditorModel:parsed['--ollama-model'],aiVariation:variation,
  ffmpegDir:parsed['--ffmpeg-dir'],mode:'strict',burnSubtitles:parsed['--burn-subtitles']==='true',visualPreset:parsed['--visual-preset']??null,
 };
}
export const personaAiReelUsage=
 'Usage: npm run media:ai:reel -- --takes "<folder>" --brief "<brief.json>" '+
 '--out "<NEW-output-folder>" --whisper-cli "<whisper-cli.exe>" '+
 '--whisper-model "<multilingual-whisper.ggml.bin>" '+
 '--ollama-model "qwen3:4b-instruct" [--variation cinematic|humor|intimate|unexpected] [--visual-preset Dynamic|Cinematic] [--burn-subtitles true|false] [--ffmpeg-dir "<bin>"]';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const args=readPersonaAiReelArgs(process.argv.slice(2));
  const result=await runFirstReel(args);
  process.stdout.write(JSON.stringify({
   status:result.status,
   video:result.aiFinishedVideo??null,
   sourceDraft:result.output??null,
   comparisonPackage:result.aiColorPackage??null,
   qa:result.aiFinishedQaPath??null,
   aiEditorial:result.aiEditorial??null,
   review:result.status==='awaiting-author-review'?'MP4 rendered, NOT published. Open draft-reel.mp4 and QA.':
    'No completed MP4; inspect RECOVERY-RESULT.md and real evidence before retry.',
   output:args.outputDir,
  },null,2)+'\n');
  process.exitCode=firstReelCliExitCode(result);
 }catch(error){
  process.stderr.write(String(error?.message??error)+'\n'+personaAiReelUsage+'\n');
  process.exitCode=1;
 }
}
