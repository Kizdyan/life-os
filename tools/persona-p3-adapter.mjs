/** Safe Node -> Python 3.11 bridge for Persona P3 gates.
 * Explicit inputs only; no unapproved image analysis or publication.
 * This does not manage a second ProductionJob or replace the FFmpeg renderer.
 */
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const here=new URL('.',import.meta.url);
const fail=msg=>{throw new Error('Persona P3: '+msg)};
const py=process.env.PERSONA_PYTHON?.trim() || (process.platform==='win32'?'py':'python3');
const pyPrefix=process.platform==='win32' && !process.env.PERSONA_PYTHON?['-3.11']:[];
const scripts={coverage:'coverage_inspector.py',moments:'approved_moments_library.py',style:'creative_style_validator.py',economics:'production_economics.py'};

async function run(script,args,{timeoutMs=120000,accept=[0]}={}) {
 if(!Object.hasOwn(scripts,script))fail('Unknown command');
 const path=fileURLToPath(new URL(scripts[script],here));
 return await new Promise((ok,no)=>{
  const p=spawn(py,[...pyPrefix,path,...args.map(String)],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let out='',err='',settled=false;
  const finish=(e,value)=>{if(settled)return;settled=true;clearTimeout(timer);e?no(e):ok(value)};
  const timer=setTimeout(()=>{p.kill();finish(Error('Python stage timeout'))},timeoutMs);
  p.stdout.on('data',b=>{out+=String(b);if(out.length>524288){p.kill();finish(Error('Python stdout too large'))}});
  p.stderr.on('data',b=>{err=(err+String(b)).slice(-4096)});
  p.on('error',e=>finish(e));
  p.on('close',code=>accept.includes(code)?finish(null,{code,stdout:out}):finish(Error(script+' exit '+code+': '+err.slice(-1200))));
 });
}
async function readJson(path){const raw=await readFile(resolve(path),'utf8');return JSON.parse(raw)}
export async function coverageGate({brief,input,bindings,approvalSha256,output,ffprobe='ffprobe'}){
 if(!/^[a-f0-9]{64}$/i.test(approvalSha256||''))fail('Real approved brief SHA required');
 const r=await run('coverage',['--brief',resolve(brief),'--input',resolve(input),'--bindings',resolve(bindings),'--approval-sha256',approvalSha256,'--ffprobe',ffprobe,'--output',resolve(output)],{accept:[0,2]});
 const report=await readJson(output);
 if(!report?.summary||report.briefSha256!==approvalSha256.toLowerCase())fail('Invalid coverage report');
 return {status:r.code===0&&report.readyForUnattendedRender===true?'PASS':'REVIEW_REQUIRED',report};
}
export async function approvedCandidates({database,video,kind,minScore=4}){
 const args=['--db',resolve(database),'suggest','--video',resolve(video),'--min-score',String(minScore)];
 if(kind)args.push('--kind',kind);
 const {stdout}=await run('moments',args);
 const data=JSON.parse(stdout);
 if(!Array.isArray(data)||data.some(x=>x.status!=='AUTHOR_APPROVED_CANDIDATE'))fail('Invalid approved moments reply');
 return data;
}
export async function styleGate({plan,contract=fileURLToPath(new URL('creative_style_contract.json',here))}){
 const r=await run('style',['--plan',resolve(plan),'--contract',resolve(contract)],{accept:[0,2]});
 const result=JSON.parse(r.stdout);
 return {status:r.code===0&&result.status==='PASS'?'PASS':'BLOCKED',result};
}
export async function economicsCommand({database,command,args=[]}){
 const allowed=new Set(['create','start','finish','manual','approve','manual-complete','report']);
 if(!allowed.has(command))fail('Unsupported economics command');
 const {stdout}=await run('economics',['--db',resolve(database),command,...args]);
 return JSON.parse(stdout);
}
