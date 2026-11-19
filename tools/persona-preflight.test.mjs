import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyLocalServices,findFfmpegDir,inspectLocalServices} from './persona-preflight.mjs';

const none={unified:{occupied:false,worker:false,web:false},worker:{occupied:false,worker:false},web:{occupied:false,web:false}};
test('preflight accepts a fully running Persona and does not label its occupied port as a failure',()=>{
 assert.equal(classifyLocalServices({...none,unified:{occupied:true,worker:true,web:true}}).state,'RUNNING_UNIFIED');
 assert.equal(classifyLocalServices({...none,worker:{occupied:true,worker:true},web:{occupied:true,web:true}}).state,'RUNNING_SPLIT');
 assert.equal(classifyLocalServices(none).state,'STOPPED');
});
test('preflight refuses to call foreign service or partial startup healthy',()=>{
 assert.equal(classifyLocalServices({...none,unified:{occupied:true,worker:false,web:true}}).state,'PORT_CONFLICT');
 assert.equal(classifyLocalServices({...none,worker:{occupied:true,worker:true}}).state,'PORT_CONFLICT');
 assert.equal(classifyLocalServices({...none,web:{occupied:true,web:true}}).state,'PORT_CONFLICT');
});
test('real localhost HTTP probe recognizes worker identity without exposing its token',async()=>{
 const health=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'application/json'});
  res.end(JSON.stringify({service:'persona-media-worker',token:'test-only-private-token'}));
 });
 const web=createServer((req,res)=>{
  res.writeHead(200,{'content-type':'text/html'});
  res.end('<!doctype html><html lang="ru"><title>Life OS · Persona</title></html>');
 });
 const empty=createServer((req,res)=>{res.writeHead(200,{'content-type':'text/plain'});res.end('not Persona')});
 await Promise.all([health,web,empty].map(server=>new Promise(ok=>server.listen(0,'127.0.0.1',ok))));
 const ports={unified:empty.address().port,worker:health.address().port,web:web.address().port};
 try{
  const valid=await inspectLocalServices(ports);
  assert.equal(valid.state,'PORT_CONFLICT','foreign listener on 3000 cannot be treated as healthy');
  assert.equal(JSON.stringify(valid).includes('test-only-private-token'),false);
  const split=await inspectLocalServices({...ports,unified:await unusedPort()});
  assert.equal(split.state,'RUNNING_SPLIT');
  assert.equal(JSON.stringify(split).includes('test-only-private-token'),false);
 }finally{await Promise.all([health,web,empty].map(server=>new Promise(ok=>server.close(ok))))}
});
async function unusedPort(){
 const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const port=server.address().port;await new Promise(ok=>server.close(ok));return port;
}
test('FFmpeg resolver recognizes a configured folder without modifying it',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-preflight-ffmpeg-'));
 const folder=join(root,'ffmpeg');
 try{
  await mkdir(folder);
  const suffix=process.platform==='win32'?'.exe':'';
  await writeFile(join(folder,'ffmpeg'+suffix),'');
  await writeFile(join(folder,'ffprobe'+suffix),'');
  assert.equal(findFfmpegDir({PERSONA_MEDIA_FFMPEG_DIR:folder},root),folder);
  assert.equal(findFfmpegDir({},root),null);
 }finally{await rm(root,{recursive:true,force:true})}
});
