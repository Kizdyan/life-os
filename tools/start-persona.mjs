import {spawn} from 'node:child_process';
import {existsSync, readFileSync, readdirSync,lstatSync} from 'node:fs';
import {homedir, tmpdir} from 'node:os';
import {extname, join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'vite';
import {createPersonaMediaWorker, parseWorkerArgs} from './persona-media-worker.mjs';

const port = 3000;
const origin = `http://127.0.0.1:${port}`;
const studio = origin + '/#persona';
const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'apps', 'web');
const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
 '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json',
 '.jpg':'image/jpeg','.json':'application/json; charset=utf-8','.ttf':'font/ttf','.woff2':'font/woff2'};

async function buildFrontend() {
 const result = await build({root:web, configFile:false, envFile:false,
  define:{'import.meta.env.VITE_PERSONA_WORKER_BASE':JSON.stringify('/persona-worker')},
  build:{write:false,emptyOutDir:false}});
 const files = new Map();
 for (const output of (Array.isArray(result) ? result : [result])) {
  for (const file of output.output) {
   files.set('/'+file.fileName, Buffer.from(file.type==='asset' ? file.source : file.code));
  }
 }
 return createPersonaFrontendHandler(files);
}

export function createPersonaFrontendHandler(files,publicRoot=join(web,'public')){
 function collect(directory,prefix=''){
  for(const file of readdirSync(directory,{withFileTypes:true})){
   if(file.isSymbolicLink())continue; // Includes Windows directory junctions.
   const path=join(directory,file.name),url=prefix+'/'+file.name;
   if(file.isDirectory())collect(path,url);
   else if(file.isFile()&&mime[extname(file.name)])files.set(url,readFileSync(path));
  }
 }
 if(!lstatSync(publicRoot).isSymbolicLink())collect(publicRoot);
 return (req,res,url)=>{
  // Check the original target, since new URL() removes dot segments before lookup.
  let original;
  try{original=decodeURIComponent((req.url??url.pathname).split('?')[0])}catch{res.writeHead(404).end();return;}
  if(original.includes('\\')||original.includes('\0')||original.split('/').some(part=>part==='.'||part==='..')){
   res.writeHead(404).end();return;
  }
  const path=url.pathname==='/'?'/index.html':url.pathname;
  const bytes=files.get(path);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
  if(!bytes){res.writeHead(404).end();return;}
  res.writeHead(200,{'Content-Type':mime[extname(path)]??'application/octet-stream',
   'Content-Length':bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(req.method==='GET'?bytes:undefined);
 };
}

function openBrowser(){
 const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',studio],
  {detached:true,stdio:'ignore',windowsHide:true});
 child.on('error',()=>console.error('Open the browser at '+studio));
 child.unref();
}

async function start() {
 process.chdir(root);
 if(existsSync('.env.local'))process.loadEnvFile('.env.local');
 const tools=join(homedir(),'Tools');
 const ffmpeg=join(tools,'FFmpeg');
 if(!process.env.PERSONA_MEDIA_FFMPEG_DIR&&existsSync(ffmpeg)){
  const folders=[join(ffmpeg,'bin'),...readdirSync(ffmpeg,{withFileTypes:true})
   .filter(item=>item.isDirectory()).map(item=>join(ffmpeg,item.name,'bin'))];
  const bin=folders.find(dir=>['ffmpeg.exe','ffprobe.exe'].every(file=>existsSync(join(dir,file))));
  if(bin)process.env.PERSONA_MEDIA_FFMPEG_DIR=bin;
 }
 const whisper=join(tools,'whisper.cpp');
 for(const [key,path] of Object.entries({
  PERSONA_MEDIA_WHISPER_CLI:join(whisper,'bin','whisper-cli.exe'),
  PERSONA_MEDIA_WHISPER_MODEL:join(whisper,'models','ggml-small.bin'),
 })){
  if(!process.env[key]&&existsSync(path))process.env[key]=path;
 }
 const outputRoot=process.env.PERSONA_MEDIA_OUTPUT_ROOT||
  join(process.env.LOCALAPPDATA||tmpdir(),'LifeOS','Persona','renders');
 let running;
 try {
  const response=await fetch(origin+'/persona-worker/health',{signal:AbortSignal.timeout(2800)});
  if(response.ok&&response.headers.get('Content-Type')?.startsWith('application/json'))
   running=(await response.json()).service==='persona-media-worker';
 } catch { /* The server will bind the port below. */ }
 if(!running){
  const config=parseWorkerArgs(['--port',String(port),'--output-root',outputRoot]);
  const frontend=await buildFrontend();
  const worker=createPersonaMediaWorker({...config,frontend});
  await worker.start();
 }
 console.log('Persona: '+studio);
 openBrowser();
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try { await start(); }
 catch(error) {
  console.error(error.code==='EADDRINUSE'?'Port 3000 is already used by another application.':error.message);
  process.exitCode=1;
 }
}
