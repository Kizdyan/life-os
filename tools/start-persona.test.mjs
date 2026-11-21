import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createPersonaFrontendHandler} from './start-persona.mjs';

async function serve(handler){
 const server=createServer((req,res)=>handler(req,res,new URL(req.url,'http://localhost')));
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});
 return {get:(path,method='GET')=>new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port:server.address().port,path,method},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));
   res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,bytes:Buffer.concat(chunks)}));
  });req.on('error',reject);req.end();
 }),close:()=>new Promise(resolve=>server.close(resolve))};
}

test('combined launcher serves exact nested v1 JPG and provenance JSON bytes with correct MIME and HEAD',async()=>{
 const server=await serve(createPersonaFrontendHandler(new Map([['/index.html',Buffer.from('home')]])));
 try{
  for(const [name,mime] of [['empty-stage.jpg','image/jpeg'],['provenance.json','application/json; charset=utf-8']]){
   const path='/carousel-backgrounds/v1/'+name,response=await server.get(path);
   const original=await readFile(new URL('../apps/web/public'+path,import.meta.url));
   assert.equal(response.status,200);assert.equal(response.headers['content-type'],mime);assert.deepEqual(response.bytes,original);
   const head=await server.get(path,'HEAD');assert.equal(head.status,200);assert.equal(head.bytes.length,0);
   assert.equal(Number(head.headers['content-length']),original.length);
  }
 }finally{await server.close()}
});

test('static assets reject raw and encoded traversal before URL normalization',async()=>{
 const server=await serve(createPersonaFrontendHandler(new Map([['/index.html',Buffer.from('home')]])));
 try{
  assert.equal((await server.get('/')).status,200);
  for(const path of ['/carousel-backgrounds/v1/../../index.html','/carousel-backgrounds/%2e%2e/index.html',
   '/carousel-backgrounds/..%2findex.html','/carousel-backgrounds%5c..%5cindex.html','/%00index.html']){
   const response=await server.get(path);assert.equal(response.status,404,path);assert.equal(response.bytes.length,0);
  }
  assert.equal((await server.get('/carousel-backgrounds/v1/empty-stage.jpg','POST')).status,405);
 }finally{await server.close()}
});

test('static asset discovery never follows a nested directory symlink or Windows junction',async()=>{
 const temporary=await mkdtemp(join(tmpdir(),'persona-public-assets-'));
 let server;
 try{
  const publicRoot=join(temporary,'public'),outside=join(temporary,'outside');
  await mkdir(join(publicRoot,'nested'),{recursive:true});await mkdir(outside);
  await writeFile(join(publicRoot,'nested','safe.json'),'safe');await writeFile(join(outside,'private.json'),'private');
  await symlink(outside,join(publicRoot,'nested','escape'),process.platform==='win32'?'junction':'dir');
  server=await serve(createPersonaFrontendHandler(new Map(),publicRoot));
  const safe=await server.get('/nested/safe.json');assert.equal(safe.status,200);assert.equal(safe.bytes.toString(),'safe');
  const escape=await server.get('/nested/escape/private.json');assert.equal(escape.status,404);assert.equal(escape.bytes.length,0);
 }finally{
  if(server)await server.close();
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+sep+'persona-public-assets-'));
  await rm(temporary,{recursive:true,force:true});
 }
});
