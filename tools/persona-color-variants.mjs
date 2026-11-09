#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,constants as fsConstants} from 'node:fs';
import {access,copyFile,mkdir,mkdtemp,rm,stat,writeFile} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getVisualPreset} from './persona-creative-director.mjs';

const presets=[
 ['natural-clean','Natural Clean','colorbalance=rm=.006:gm=-.002:bm=.008:rh=.003:gh=-.001:bh=.004,eq=brightness=0:contrast=1.025:saturation=.99:gamma=1.015'],
 ['warm-cinematic','Warm Cinematic','colorbalance=rm=.006:gm=.002:bm=-.004:rh=.002:gh=.001:bh=-.001,eq=brightness=.003:contrast=1.035:saturation=1.01:gamma=1.008'],
 ['muted-filmic','Muted Filmic','eq=brightness=-.005:contrast=1.05:saturation=.90'],
];
const fail=message=>{throw Error('Persona color variants: '+message)};
async function sha(path){
 const hash=createHash('sha256');
 for await(const chunk of createReadStream(path))hash.update(chunk);
 return hash.digest('hex');
}
function env(ffmpegDir){
 const e={...process.env},key=Object.keys(e).find(k=>k.toLowerCase()==='path')||'PATH';
 if(ffmpegDir)e[key]=resolve(ffmpegDir)+(process.platform==='win32'?';':':')+(e[key]||'');
 return e;
}
function run(binary,args,environment,{captureStdout=false}={}){
 return new Promise((ok,bad)=>{
  const child=spawn(binary,args,{shell:false,windowsHide:true,env:environment,stdio:['ignore','pipe','pipe']});
  let stderr='',stdout='';
  const max=2*1024*1024;
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-max)});
  child.stdout.on('data',chunk=>{if(captureStdout)stdout+=chunk.toString();if(stdout.length>max){child.kill();bad(Error('ffprobe output too large'))}});
  child.on('error',bad);
  child.on('close',code=>code===0?ok(stdout):bad(Error(stderr||binary+' exited '+code)));
 });
}
async function preflight(input,environment){
 const stdout=await run('ffprobe',['-v','error','-show_streams','-of','json',input],environment,{captureStdout:true});
 let data;
 try{data=JSON.parse(stdout)}catch{fail('ffprobe did not return valid JSON')}
 const video=data.streams?.find(stream=>stream.codec_type==='video');
 if(!video)fail('no video stream');
 // FFmpeg maps every audio stream (0:a?), not only the first one.
 // Reject a mixed AAC/PCM source before creating the output folder.
 for(const audio of data.streams?.filter(stream=>stream.codec_type==='audio')??[]){
  if(String(audio.codec_name||'').toLowerCase()!=='aac')
   fail('audio codec '+String(audio.codec_name||'unknown')+' is not supported for browser-safe color previews; export an AAC MP4 without changing the original');
 }
 if(data.streams?.some(stream=>stream.codec_type==='subtitle'))
  fail('embedded subtitles would be lost during color rendering; use a subtitle-free source or an explicitly burnt-in copy');
 const transfer=String(video.color_transfer||'unknown').toLowerCase();
 const primaries=String(video.color_primaries||'unknown').toLowerCase();
 if(transfer==='smpte2084'||transfer==='arib-std-b67'||primaries.startsWith('bt2020'))
  fail('HDR or BT.2020 detected; automatic HDR-to-SDR transformation is prohibited');
 const rotation=Number(video.tags?.rotate||0);
 const sideRotation=video.side_data_list?.find(item=>Number.isFinite(Number(item.rotation)))?.rotation;
 if(rotation!==0||(sideRotation!==undefined&&Number(sideRotation)!==0))
  fail('rotation metadata detected; manual orientation review required');
 return video;
}
/** Local CLI: node tools/persona-color-variants.mjs <original.mp4> <new-output-dir> [ffmpeg-dir] */
export async function renderVisualPreset({inputPath,outputPath,presetId,ffmpegDir}={}){
 const preset=getVisualPreset(presetId),input=resolve(inputPath),output=resolve(outputPath),environment=env(ffmpegDir);
 if(input===output||!output.toLowerCase().endsWith('.mp4'))fail('Use a new output MP4');
 for(const path of [output,output+'.visual-preset.json'])await access(path).then(()=>fail('output already exists'),e=>{if(e.code!=='ENOENT')throw e});
 const before=await preflight(input,environment),sourceSha256=await sha(input);
 await mkdir(dirname(output),{recursive:true});const temp=await mkdtemp(join(dirname(output),'.persona-grade-'));let owned=false;
 try{
  const staged=join(temp,'grade.mp4');
  await run('ffmpeg',['-v','error','-n','-i',input,'-map','0:v:0','-map','0:a?','-vf',preset.filter,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',staged],environment);
  const after=await preflight(staged,environment);
  if(before.width!==after.width||before.height!==after.height||before.avg_frame_rate!==after.avg_frame_rate||Math.abs(Number(before.duration)-Number(after.duration))>.1)fail('Visual preset changed geometry or timing');
  if(await sha(input)!==sourceSha256)fail('source changed during grading');
  const result={version:1,presetId:preset.id,label:preset.name,filter:preset.filter,source:{path:input,sha256:sourceSha256},output:{path:output,sha256:await sha(staged)},publicationApproved:false,distributionAllowed:false};
  await copyFile(staged,output,fsConstants.COPYFILE_EXCL);owned=true;
  await writeFile(output+'.visual-preset.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
 }catch(error){if(owned)await rm(output,{force:true});throw error}finally{await rm(temp,{recursive:true,force:true})}
}
export async function createColorVariants({inputPath,outputDir,ffmpegDir}={}){
 if(typeof inputPath!=='string'||!inputPath.trim()||
  typeof outputDir!=='string'||!outputDir.trim())fail('inputPath and NEW outputDir required');
 const input=resolve(inputPath),out=resolve(outputDir),environment=env(ffmpegDir);
 const sourceName=basename(input);
 const renderedNames=presets.map((preset,index)=>String.fromCharCode(65+index)+'-'+preset[0]+'.mp4');
 const stagedSourceName=renderedNames.some(name=>name.toLowerCase()===sourceName.toLowerCase())
  ?'SOURCE-'+sourceName:sourceName;
 if(!sourceName.toLowerCase().endsWith('.mp4')||stagedSourceName.length>220)
  fail('original must be an MP4 with a supported file name (max 220 characters)');
 const sourceStat=await stat(input);
 if(!sourceStat.isFile()||sourceStat.size<1024||sourceStat.size>160*1024*1024)
  fail('input must be an existing MP4 between 1 KB and 160 MB (Persona browser import limit)');
 await preflight(input,environment);
 await access(out).then(()=>fail('outputDir already exists'),error=>{if(error.code!=='ENOENT')throw error});
 await mkdir(out);
 const sourceSha256=await sha(input);
 const variants=[];
 for(const [index,[id,label,filter]] of presets.entries()){
  const outputPath=join(out,String.fromCharCode(65+index)+'-'+id+'.mp4');
  await run('ffmpeg',['-v','error','-n','-i',input,'-map','0:v:0','-map','0:a?','-vf',filter,
   '-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p',
   '-c:a','copy','-movflags','+faststart',outputPath],environment);
  const outputStat=await stat(outputPath);
  if(outputStat.size<1024||outputStat.size>160*1024*1024)fail('variant '+id+' is outside Persona browser import limit (1 KB–160 MB)');
  variants.push({id,label,filter,path:outputPath,sha256:await sha(outputPath)});
 }
 // A single browser file picker cannot select files from different folders.
 // Stage an exact copy beside COMPARISON.json and the three renders, without
 // modifying or deleting the original at inputPath.
 const stagedSourcePath=join(out,stagedSourceName);
 await copyFile(input,stagedSourcePath,fsConstants.COPYFILE_EXCL);
 if(await sha(stagedSourcePath)!==sourceSha256)
  fail('original changed while rendering; the staged copy no longer matches its SHA-256');
 const result={version:1,kind:'persona-color-variants-v1',status:'awaiting-author-comparison',
  publicationApproved:false,source:{path:stagedSourcePath,sha256:sourceSha256},variants,
  notice:'Locally rendered SDR color variants only. Source and audio unchanged; no generative face or body edits.'};
 await writeFile(join(out,'COMPARISON.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [, ,inputPath,outputDir,ffmpegDir]=process.argv;
 if(!inputPath||!outputDir){
  process.stderr.write('Usage: node tools/persona-color-variants.mjs <original.mp4> <new-output-dir> [ffmpeg-dir]\n');
  process.exitCode=2;
 }else{
  createColorVariants({inputPath,outputDir,ffmpegDir}).then(result=>{
   process.stdout.write('Created '+result.variants.length+' verified color variants in '+resolve(outputDir)+'\n');
   process.stdout.write('Select all five files from the output folder in Persona: COMPARISON.json, staged original and three MP4 variants.\n');
  }).catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1});
 }
}
