import http from 'node:http';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,rm,stat} from 'node:fs/promises';
import {pipeline} from 'node:stream/promises';
import {spawn} from 'node:child_process';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import path from 'node:path';

const port=Number(process.env.PORT||8080);
const secret=process.env.PERSONA_WORKER_TOKEN;
const root=path.resolve(process.env.PERSONA_WORKER_DATA||'/tmp/persona-video-worker');
const maxBytes=Number(process.env.PERSONA_MAX_UPLOAD_BYTES||524288000);
const jobs=new Map();
const queue=[];
const maxQueuedJobs=Number(process.env.PERSONA_MAX_QUEUED_JOBS||20);
let busy=false;
if(!secret||secret.length<32)throw Error('PERSONA_WORKER_TOKEN must be at least 32 characters');
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid PORT');
await mkdir(root,{recursive:true});

function reply(res,code,data){
 res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
 res.end(JSON.stringify(data));
}
function authenticated(req){
 const provided=req.headers.authorization;
 if(typeof provided!=='string'||!provided.startsWith('Bearer '))return false;
 const a=Buffer.from(provided.slice(7));const b=Buffer.from(secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function ffmpeg(input,output,preset){
 const filters={
  natural:'eq=contrast=1.025:brightness=0.005:saturation=0.99',
  warm:'eq=contrast=1.025:saturation=1.01,colorbalance=rs=.025:gs=.006:bs=-.015',
  neutral:'null',
 };
 return new Promise((resolve,reject)=>{
  const args=['-hide_banner','-nostdin','-y','-i',input,'-map','0:v:0','-map','0:a?','-vf',filters[preset],
   '-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k',
   '-movflags','+faststart','-f','mp4',output];
  const proc=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
  const timeout=setTimeout(()=>proc.kill('SIGKILL'),Number(process.env.PERSONA_RENDER_TIMEOUT_MS||900000));
  let stderr='';
  proc.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-3000)});
  proc.on('error',error=>{clearTimeout(timeout);reject(error)});
  proc.on('close',code=>{clearTimeout(timeout);code===0?resolve():reject(Error('ffmpeg failed or timed out '+code+': '+stderr))});
 });
}
function probe(file){
 return new Promise((resolve,reject)=>{
  const proc=spawn('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',file],{stdio:['ignore','pipe','pipe']});
  let output='';
  proc.stdout.on('data',chunk=>{output+=chunk.toString()});
  proc.on('error',reject);
  proc.on('close',code=>{
   if(code!==0)return reject(Error('ffprobe failed'));
   try{
    const data=JSON.parse(output);
    const video=data.streams?.find(stream=>stream.codec_type==='video');
    const duration=Number(data.format?.duration);
    if(!video||!video.width||!video.height||!(duration>0))throw Error('Invalid video stream');
    resolve({width:video.width,height:video.height,durationSeconds:duration,hasAudio:data.streams.some(stream=>stream.codec_type==='audio')});
   }catch(error){reject(error)}
  });
 });
}
async function runQueue(){
 if(busy)return;
 busy=true;
 while(queue.length){
  const job=queue.shift();job.status='processing';job.updatedAt=new Date().toISOString();
  try{
   job.source=await probe(path.join(root,job.id,'input'));
   await ffmpeg(path.join(root,job.id,'input'),path.join(root,job.id,'output.mp4'),job.preset);
   job.output=await probe(path.join(root,job.id,'output.mp4'));
   if(job.source.hasAudio&&!job.output.hasAudio)throw Error('Output audio missing');
   job.status='completed';
  }catch(error){job.status='failed';job.error=String(error).slice(0,500)}
  job.updatedAt=new Date().toISOString();
 }
 busy=false;
}
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/health'&&req.method==='GET')return reply(res,200,{ok:true,worker:'persona-video-v1'});
  if(!authenticated(req))return reply(res,401,{error:'unauthorized'});
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/jobs'&&req.method==='POST'){
   const preset=url.searchParams.get('preset')||'natural';
   if(!['natural','warm','neutral'].includes(preset))return reply(res,400,{error:'invalid_preset'});
   const declared=Number(req.headers['content-length']);
   if(!Number.isSafeInteger(declared)||declared<1||declared>maxBytes)return reply(res,413,{error:'invalid_upload_size'});
   if(queue.length>=maxQueuedJobs)return reply(res,429,{error:'queue_full'});
   const id=randomUUID();const dir=path.join(root,id);await mkdir(dir);
   let received=0;
   try{
    await pipeline(req,async function*(source){
     for await(const chunk of source){
      received+=chunk.length;
      if(received>maxBytes)throw Error('upload_too_large');
      yield chunk;
     }
    },createWriteStream(path.join(dir,'input'),{flags:'wx'}));
    if(received!==declared)throw Error('upload_size_mismatch');
   }catch(error){await rm(dir,{recursive:true,force:true});return reply(res,400,{error:String(error).slice(0,150)})}
   const job={id,preset,status:'queued',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
   jobs.set(id,job);queue.push(job);void runQueue();
   return reply(res,202,{job});
  }
  const match=/^\/jobs\/([0-9a-f-]{36})(\/output)?$/.exec(url.pathname);
  if(match&&req.method==='GET'){
   const job=jobs.get(match[1]);if(!job)return reply(res,404,{error:'not_found'});
   if(!match[2])return reply(res,200,{job});
   if(job.status!=='completed')return reply(res,409,{error:'not_ready',status:job.status});
   const output=path.join(root,job.id,'output.mp4');
   const info=await stat(output);
   res.writeHead(200,{'content-type':'video/mp4','content-length':info.size,'content-disposition':'attachment; filename="persona-render.mp4"','cache-control':'no-store'});
   return createReadStream(output).pipe(res);
  }
  return reply(res,404,{error:'not_found'});
 }catch(error){if(!res.headersSent)reply(res,500,{error:'internal_error'});else res.destroy()}
});
server.requestTimeout=10*60*1000;
server.listen(port,'0.0.0.0',()=>console.log('Persona video worker listening on '+port));
