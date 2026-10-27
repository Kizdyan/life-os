#!/usr/bin/env node
// Local-only Persona rendering bridge. Run: node tools/persona-render-bridge.mjs
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const host='127.0.0.1', port=Number(process.env.PERSONA_RENDER_PORT||47831);
const origins=new Set(['http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173']);
const token=randomUUID();
const sessions=new Map();
const MAX_CLIP=250*1024*1024, MAX_TOTAL=1024*1024*1024;
function respond(res,status,data,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data))}
async function json(req){let chunks=[],n=0;for await(const part of req){n+=part.length;if(n>65536)throw Error('JSON too large');chunks.push(part)}return JSON.parse(Buffer.concat(chunks).toString('utf8'))}
function run(args){return new Promise((ok,fail)=>{const p=spawn(process.execPath,[fileURLToPath(new URL('./persona-timeline-render.mjs',import.meta.url)),...args],{shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let err='';p.stderr.on('data',b=>err=(err+b.toString()).slice(-2000));p.on('error',fail);p.on('close',code=>code===0?ok():fail(Error(err||'Render failed')))})}
async function cleanup(s){sessions.delete(s.id);await rm(s.dir,{recursive:true,force:true})}
const server=createServer(async(req,res)=>{
 const expectedHosts=new Set(['127.0.0.1:'+port,'localhost:'+port]);
 if(!expectedHosts.has(req.headers.host)){respond(res,403,{error:'Host not allowed'});return}
 const origin=req.headers.origin;
 if(origin&&!origins.has(origin)){respond(res,403,{error:'Origin not allowed'});return}
 if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin')}
 res.setHeader('Cache-Control','no-store');
 if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Methods':'GET,POST,PUT,DELETE,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Persona-Token'});res.end();return}
 if(req.method!=='GET'||new URL(req.url||'/', 'http://127.0.0.1').pathname!=='/health'){
  if(req.headers['x-persona-token']!==token){respond(res,401,{error:'Invalid local render token'});return}
 }
 const url=new URL(req.url||'/', 'http://127.0.0.1');
 try{
  if(req.method==='GET'&&url.pathname==='/health'){respond(res,200,{ok:true,service:'persona-render-bridge',token});return}
  if(req.method==='POST'&&url.pathname==='/session'){
   const project=await json(req);
   if(project.version!==1||!Array.isArray(project.clips)||project.clips.length<2||project.clips.length>30||![25,30,60].includes(project.fps)||![[1080,1920],[1920,1080]].some(([w,h])=>project.width===w&&project.height===h))throw Error('Invalid project');
   if(project.clips.some(c=>!Number.isFinite(c.startSec)||!Number.isFinite(c.durationSec)||c.startSec<0||c.durationSec<=0||c.durationSec>900))throw Error('Invalid clip timing');
   if(project.clips.reduce((a,c)=>a+c.durationSec,0)>900)throw Error('Timeline too long');
   const id=randomUUID(),dir=await mkdtemp(join(tmpdir(),'persona-bridge-'));
   await mkdir(join(dir,'source'));
   const clips=project.clips.map((c,i)=>({path:'source/'+i+'.mp4',startSec:c.startSec,durationSec:c.durationSec}));
   const soundtrack = project.soundtrack === undefined ? undefined : {path:'soundtrack.mp3',startSec:project.soundtrack?.startSec??0,volume:project.soundtrack?.volume??0.8,originalVolume:project.soundtrack?.originalVolume??0.2};
   if (project.soundtrack !== undefined && (!project.soundtrack || !Number.isFinite(soundtrack.startSec)||soundtrack.startSec<0||!Number.isFinite(soundtrack.volume)||soundtrack.volume<0||soundtrack.volume>2||!Number.isFinite(soundtrack.originalVolume)||soundtrack.originalVolume<0||soundtrack.originalVolume>2)) throw Error('Invalid soundtrack settings');
   const s={id,dir,clips,project:{...project,clips,soundtrack},received:new Set(),musicReceived:false,total:0,rendered:false,busy:false,created:Date.now()};
   sessions.set(id,s);respond(res,200,{id,clips:clips.length});return
  }
  const match=url.pathname.match(/^\/session\/([a-f0-9-]+)(?:\/(clip\/(\d+)|music|render|download))?$/);
  const s=match&&sessions.get(match[1]);
  if(!s){respond(res,404,{error:'Session not found'});return}
  if(req.method==='DELETE'&&!match[2]){if(s.busy)throw Error('Session busy');await cleanup(s);respond(res,200,{ok:true});return}
  if(req.method==='PUT'&&match[2]?.startsWith('clip/')){
   const i=Number(match[3]),length=Number(req.headers['content-length']);
   if(!Number.isInteger(i)||i<0||i>=s.clips.length||s.received.has(i)||s.busy||!Number.isSafeInteger(length)||length<1||length>MAX_CLIP||s.total+length>MAX_TOTAL)throw Error('Invalid clip upload');
   s.busy=true;const file=join(s.dir,'source',i+'.mp4');
   try{await pipeline(req,createWriteStream(file,{flags:'wx'}));if((await stat(file)).size!==length)throw Error('Upload size mismatch');s.received.add(i);s.total+=length;respond(res,200,{ok:true,index:i})}
   catch(e){await rm(file,{force:true});throw e}finally{s.busy=false}
   return
  }
  if(req.method==='PUT'&&match[2]==='music'){
   const length=Number(req.headers['content-length']);
   if(!s.project.soundtrack||s.musicReceived||s.busy||!Number.isSafeInteger(length)||length<1||length>80*1024*1024||s.total+length>MAX_TOTAL)throw Error('Invalid soundtrack upload');
   s.busy=true;const file=join(s.dir,'soundtrack.mp3');
   try{await pipeline(req,createWriteStream(file,{flags:'wx'}));if((await stat(file)).size!==length)throw Error('Upload size mismatch');s.musicReceived=true;s.total+=length;respond(res,200,{ok:true})}
   catch(e){await rm(file,{force:true});throw e}finally{s.busy=false}
   return
  }
  if(req.method==='POST'&&match[2]==='render'){
   if(s.busy||s.rendered||s.received.size!==s.clips.length||(s.project.soundtrack&&!s.musicReceived))throw Error('Upload incomplete or render busy');
   s.busy=true;
   try{const projectPath=join(s.dir,'project.json');await writeFile(projectPath,JSON.stringify(s.project));await run([projectPath,join(s.dir,'result.mp4')]);s.rendered=true;respond(res,200,{ok:true,download:'/session/'+s.id+'/download'})}
   finally{s.busy=false}
   return
  }
  if(req.method==='GET'&&match[2]==='download'){
   if(!s.rendered)throw Error('Render not ready');
   const output=join(s.dir,'result.mp4'),size=(await stat(output)).size;
   res.writeHead(200,{'Content-Type':'video/mp4','Content-Disposition':'attachment; filename="persona-render.mp4"','Content-Length':size});createReadStream(output).pipe(res);return
  }
  respond(res,404,{error:'Unknown route'})
 }catch(e){respond(res,400,{error:e instanceof Error?e.message:'Request failed'})}
});
setInterval(()=>{for(const s of sessions.values())if(!s.busy&&Date.now()-s.created>60*60*1000)void cleanup(s)},60000).unref();
server.listen(port,host,()=>console.log('Persona local renderer: http://'+host+':'+port));
