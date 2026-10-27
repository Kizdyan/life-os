#!/usr/bin/env node
/** Trusted local media QA: inspect the actual file; do not accept caller-supplied pass flags. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluatePersonaMediaHandoff,buildVerifiedPersonaDeliveryInput} from '../packages/core/src/persona-media-handoff.mjs';
import {buildDistributionPlan} from '../packages/core/src/persona-distribution-plan.mjs';
function run(binary,args){
 return new Promise((resolveRun,reject)=>{
  const child=spawn(binary,args,{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='';
  child.stdout.on('data',b=>{out+=b;if(out.length>2000000)child.kill()});
  child.stderr.on('data',b=>{err=(err+b).slice(-4000)});
  child.on('error',reject);
  child.on('close',code=>code===0?resolveRun(out):reject(Error(binary+' exit '+code+': '+err)));
 });
}
async function hash(path){const h=createHash('sha256');for await(const chunk of createReadStream(path))h.update(chunk);return h.digest('hex')}
function fpsValue(value){if(!value)return NaN;const [a,b='1']=value.split('/').map(Number);return a/b}
async function verifyVideo(path){
 const info=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate','-of','json',path]));
 const video=info.streams?.find(s=>s.codec_type==='video'),audio=info.streams?.find(s=>s.codec_type==='audio');
 if(!video)throw Error('Video stream missing');
 const blackScan=await scan(path,['-vf','blackdetect=d=0.2:pix_th=0.10','-an']);
 const silenceScan=audio?await scan(path,['-af','silencedetect=noise=-50dB:d=2','-vn']):'';
 return {durationSec:Number(info.format?.duration),fps:fpsValue(video.avg_frame_rate),width:video.width,height:video.height,
  videoCodec:video.codec_name,audioCodec:audio?.codec_name,
  blackFrameCheckPassed:!blackScan.includes('black_start:'),audioCheckPassed:!!audio&&!silenceScan.includes('silence_start:')};
}
function scan(path,filter){return new Promise((resolveScan,reject)=>{
 const child=spawn('ffmpeg',['-hide_banner','-nostdin','-i',path,...filter,'-f','null','-'],{shell:false,stdio:['ignore','ignore','pipe']});
 let err='';child.stderr.on('data',b=>{err=(err+b).slice(-200000)});child.on('error',reject);child.on('close',code=>code===0?resolveScan(err):reject(Error('QA scan failed: '+err.slice(-1000))));
})}
export async function verifyLocalPersonaRender({path,contentId,format='reel',authorApproved=false,outputPath}){
 if(!['reel','short','story','long-video'].includes(format))throw Error('This CLI verifies video formats only');
 const file=resolve(path),details=await stat(file);
 if(!details.isFile()||!details.size)throw Error('Missing or empty file');
 const evidence={path:file,bytes:details.size,sha256:await hash(file),fileExists:true,probeVerified:true,...await verifyVideo(file)};
 const handoff=evaluatePersonaMediaHandoff({contentId,format,assets:[evidence],authorApproved});
 const result={handoff,evidence,distribution:null};
 if(handoff.passed){result.distribution=buildDistributionPlan(buildVerifiedPersonaDeliveryInput({handoff}));}
 if(outputPath)await writeFile(resolve(outputPath),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [path,contentId,format='reel',outputPath]=process.argv.slice(2);
 if(!path||!contentId){console.error('Usage: node tools/persona-verify-render.mjs <file.mp4> <content-id> [reel|short|story|long-video] [report.json]');process.exitCode=2}
 else verifyLocalPersonaRender({path,contentId,format,authorApproved:false,outputPath}).then(r=>{console.log(JSON.stringify({passed:r.handoff.passed,errors:r.handoff.errors,evidence:r.evidence}));if(r.handoff.errors.some(e=>!e.includes('author approval')))process.exitCode=1}).catch(e=>{console.error(e.message);process.exitCode=1});
}
