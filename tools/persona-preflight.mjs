#!/usr/bin/env node
/**
 * Persona first-run diagnostics: read-only, offline, and token-safe.
 * Recognizes both supported local launchers rather than assuming every port
 * must be free. No media files, dotenv values, or worker tokens are read out.
 */
import {spawnSync} from 'node:child_process';
import {connect} from 'node:net';
import {existsSync,readdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const isWindows=process.platform==='win32';
const bin=name=>name+(isWindows?'.exe':'');

function runnable(command,args=['-version']){
 try{
  const p=spawnSync(command,args,{encoding:'utf8',timeout:8000,windowsHide:true,
   ...(isWindows&&/\.(cmd|bat)$/i.test(command)?{shell:true}:{})});
  return p.status===0;
 }catch{return false}
}

export function findFfmpegDir(env=process.env,home=homedir()){
 const candidates=[];
 if(env.PERSONA_MEDIA_FFMPEG_DIR)candidates.push(env.PERSONA_MEDIA_FFMPEG_DIR);
 const top=join(home,'Tools','FFmpeg');
 candidates.push(top,join(top,'bin'));
 if(existsSync(top)){
  try{for(const entry of readdirSync(top,{withFileTypes:true}))
   if(entry.isDirectory())candidates.push(join(top,entry.name,'bin'));
  }catch{/* A missing or unreadable optional directory is not fatal. */}
 }
 for(const dir of candidates)
  if(existsSync(join(dir,bin('ffmpeg')))&&existsSync(join(dir,bin('ffprobe'))))return dir;
 return null;
}

export async function portOccupied(port,host='127.0.0.1'){
 return await new Promise(done=>{
  const socket=connect({host,port});
  let settled=false;
  const end=result=>{if(settled)return;settled=true;socket.destroy();done(result)};
  socket.once('connect',()=>end(true));
  socket.once('error',error=>end(error.code!=='ECONNREFUSED'));
  socket.setTimeout(1200,()=>end(true));
 });
}

async function safeLocalGet(port,path){
 try{
  const response=await fetch('http://127.0.0.1:'+port+path,{
   cache:'no-store',signal:AbortSignal.timeout(1800)});
  if(!response.ok)return {ok:false};
  if(path.endsWith('/health')){
   if(!response.headers.get('content-type')?.includes('application/json'))return {ok:false};
   const data=await response.json();
   // Deliberately discard the token and all other response fields.
   return {ok:data?.service==='persona-media-worker'};
  }
  const type=response.headers.get('content-type')||'';
  const html=(await response.text()).slice(0,12000).toLowerCase();
  return {ok:type.includes('text/html')&&html.includes('<html')&&html.includes('life os')&&html.includes('persona')};
 }catch{return {ok:false}}
}

export async function inspectLocalServices(ports={unified:3000,worker:47832,web:5173}){
 const [uOccupied,wOccupied,webOccupied]=await Promise.all([
  portOccupied(ports.unified),portOccupied(ports.worker),portOccupied(ports.web)]);
 const [uWorker,uWeb,wWorker,webUi]=await Promise.all([
  uOccupied?safeLocalGet(ports.unified,'/persona-worker/health'):null,
  uOccupied?safeLocalGet(ports.unified,'/'):null,
  wOccupied?safeLocalGet(ports.worker,'/health'):null,
  webOccupied?safeLocalGet(ports.web,'/'):null,
 ]);
 return classifyLocalServices({
  unified:{occupied:uOccupied,worker:!!uWorker?.ok,web:!!uWeb?.ok},
  worker:{occupied:wOccupied,worker:!!wWorker?.ok},
  web:{occupied:webOccupied,web:!!webUi?.ok},
 });
}

export function classifyLocalServices({unified,worker,web}){
 if(unified.occupied&&unified.worker&&unified.web)
  return {state:'RUNNING_UNIFIED',message:'Persona уже работает: http://127.0.0.1:3000/#persona'};
 if(!unified.occupied&&worker.occupied&&worker.worker&&web.occupied&&web.web)
  return {state:'RUNNING_SPLIT',message:'Persona уже работает: http://127.0.0.1:5173/#persona'};
 if(unified.occupied||worker.occupied||web.occupied)
  return {state:'PORT_CONFLICT',message:'Один из портов 3000, 47832, 5173 занят другим или неполным сервисом. Не отключай процессы вслепую: проверь запущенные окна Persona и журналы Launcher.'};
 return {state:'STOPPED',message:'Локальные серверы не запущены; порты свободны.'};
}

export function inspectPrerequisites({repoRoot=root,env=process.env,home=homedir()}={}){
 const checks=[
  {id:'node',ok:Number(process.versions.node.split('.')[0])>=22,required:true,
   detail:'Node.js 22+ необходим для Media Worker'},
  {id:'npm',ok:runnable(isWindows?'npm.cmd':'npm',['--version']),required:true,
   detail:'npm должен запускаться вместе с Node.js'},
  {id:'worker_code',ok:existsSync(join(repoRoot,'tools','persona-media-worker.mjs')),required:true,
   detail:'Локальный код Media Worker'},
  {id:'web_code',ok:existsSync(join(repoRoot,'apps','web','index.html')),required:true,
   detail:'Локальный интерфейс Persona'},
 ];
 const external=!!findFfmpegDir(env,home)||['ffmpeg','ffprobe'].every(name=>runnable(name));
 checks.push({id:'ffmpeg',ok:external,required:true,detail:'FFmpeg + FFprobe для настоящего MP4'});
 checks.push({id:'vite',ok:existsSync(join(repoRoot,'node_modules','vite','bin','vite.js')),required:false,
  detail:'Если зависимостей нет, START_AUTO_RENDER.bat установит их через npm при подключении к сети'});
 return checks;
}

export async function runPreflight(options={}){
 const services=await inspectLocalServices(options.ports);
 const prerequisites=inspectPrerequisites(options);
 const missing=prerequisites.filter(x=>x.required&&!x.ok).map(x=>x.id);
 const status=services.state==='PORT_CONFLICT'?'BLOCKED':
  services.state!=='STOPPED'?'ALREADY_RUNNING':
  missing.length?'NEEDS_SETUP':'READY_TO_START';
 return {version:1,status,services,prerequisites,
  instructions:status==='ALREADY_RUNNING'?'Открой указанный локальный адрес в браузере.':
   status==='READY_TO_START'?'Запусти START_AUTO_RENDER.bat из актуальной папки Life OS; откроется Persona.':
   status==='NEEDS_SETUP'?'Установи отсутствующие обязательные компоненты (Node.js/npm/FFmpeg) перед монтажом.':
   'Проверь занятые порты. Не закрывай чужие приложения автоматически.'};
}

if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const result=await runPreflight();
 if(process.argv.includes('--json'))console.log(JSON.stringify(result,null,2));
 else{
  console.log('Persona preflight: '+result.status);
  for(const item of result.prerequisites)
   console.log((item.ok?'PASS':item.required?'FAIL':'WARN')+' '+item.id+' — '+item.detail);
  console.log(result.services.state+': '+result.services.message);
  console.log(result.instructions);
 }
 if(['BLOCKED','NEEDS_SETUP'].includes(result.status))process.exitCode=1;
}
