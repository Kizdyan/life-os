#!/usr/bin/env node
/**
 * Explicit local Remotion render + ffprobe verification.
 * Never installs dependencies, downloads Chromium, publishes or changes originals.
 */
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

function exec(bin,args,cwd,timeout=180000){
 return spawnSync(bin,args,{cwd,encoding:'utf8',timeout,maxBuffer:2*1024*1024,shell:false,windowsHide:true});
}
export function evaluateRender(handoff,probe,{outputSize=0}={}){
 const expected=handoff?.composition;
 const video=probe?.streams?.find(s=>s.codec_type==='video');
 const fps=video?.avg_frame_rate?.split('/').map(Number);
 const actualFps=fps?.length===2&&fps[1]>0?fps[0]/fps[1]:NaN;
 const duration=Number(probe?.format?.duration);
 const errors=[];
 if(handoff?.kind!=='PERSONA_REMOTION_HANDOFF'||!Number.isInteger(expected?.durationInFrames))errors.push('Invalid handoff');
 if(!video||video.width!==expected?.width||video.height!==expected?.height)errors.push('Unexpected dimensions');
 if(!Number.isFinite(actualFps)||Math.abs(actualFps-expected?.fps)>0.1)errors.push('Unexpected frame rate');
 if(!Number.isFinite(duration)||Math.abs(duration-expected?.durationInFrames/expected?.fps)>Math.max(0.2,2/(expected?.fps||30)))errors.push('Unexpected duration');
 if(outputSize<1000)errors.push('Empty or implausibly small output');
 return {status:errors.length?'FAIL':'TECHNICAL_PASS_REQUIRES_VISUAL_REVIEW',errors,visualApproved:false,publicationApproved:false};
}
export async function renderRemotion({workspace,output,timeoutMs=180000}={}){
 if(!Number.isInteger(timeoutMs)||timeoutMs<10000||timeoutMs>600000)throw Error('Invalid timeout');
 const cwd=resolve(workspace),destination=resolve(output);
 const handoff=JSON.parse(await readFile(join(cwd,'remotion-handoff.json'),'utf8'));
 if(handoff.kind!=='PERSONA_REMOTION_HANDOFF')throw Error('Invalid handoff');
 if(!destination.startsWith(cwd+ (process.platform==='win32'?'\\':'/')))throw Error('Output must stay within staged workspace');
 const dependencies=join(cwd,'node_modules','.bin',process.platform==='win32'?'remotion.cmd':'remotion');
 if(!(await stat(dependencies).catch(()=>null))?.isFile())throw Error('Remotion dependencies not installed in staged workspace');
 if(await stat(destination).catch(()=>null))throw Error('Output already exists');
 await mkdir(dirname(destination),{recursive:true});
 const startedAt=new Date().toISOString();
 const result=exec(dependencies,['render','index.jsx','PersonaVertical',destination,'--log=error'],cwd,timeoutMs);
 if(result.error||result.status!==0)throw Error('Remotion render failed: '+(result.error?.message??result.stderr.slice(-1000)));
 const probeResult=exec('ffprobe',['-v','error','-show_entries','stream=codec_type,width,height,avg_frame_rate:format=duration','-of','json',destination],cwd,30000);
 if(probeResult.error||probeResult.status!==0)throw Error('ffprobe validation unavailable or failed');
 const probe=JSON.parse(probeResult.stdout);
 const bytes=(await stat(destination)).size;
 const verification=evaluateRender(handoff,probe,{outputSize:bytes});
 const report={schemaVersion:1,kind:'REMOTION_RENDER_VERIFICATION',startedAt,finishedAt:new Date().toISOString(),
  output:destination,bytes,renderExitCode:result.status,verification,requiresHumanReview:true};
 const reportPath=destination+'.verification.json';
 await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 if(!flag('--workspace')||!flag('--output')){console.error('Usage: node tools/persona-remotion-render.mjs --workspace STAGED_DIR --output STAGED_DIR/out/video.mp4');process.exitCode=2}
 else renderRemotion({workspace:flag('--workspace'),output:flag('--output')}).then(r=>{console.log(JSON.stringify(r.verification));if(r.verification.status==='FAIL')process.exitCode=1}).catch(e=>{console.error(e.message);process.exitCode=1});
}
