import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {listFolder,syncLibrary,FOLDERS} from './persona-yandex-library.mjs';
const key='https://disk.yandex.ru/d/test-fixture';
const data=Buffer.from('fixture bytes');
const sha=createHash('sha256').update(data).digest('hex');
const item=(folder,name='test.jpg')=>({name,path:'/'+folder+'/'+name,type:'file',size:data.length,sha256:sha});
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
test('paginates and rejects unsupported files',async()=>{
 let calls=0;
 const r=await listFolder(key,FOLDERS[0],{fetchImpl:async url=>{
  assert.equal(url.searchParams.get('path'),'/'+FOLDERS[0]);
  assert.equal(url.searchParams.get('offset'),String(calls));
  return json({_embedded:{total:2,items:[calls++?item(FOLDERS[0],'test.exe'):item(FOLDERS[0])]}});
 }});
 assert.equal(calls,2);assert.equal(r.files.length,1);assert.equal(r.skipped.length,1);
});
test('sync verifies and reuses cached bytes without writing to cloud',async()=>{
 const cacheDir=await mkdtemp(join(tmpdir(),'persona-yandex-'));let downloads=0;
 try{
  const fetchImpl=async url=>{
   if(url.hostname==='cloud-api.yandex.net'){
    const path=url.searchParams.get('path');
    if(url.pathname.endsWith('/download'))return json({href:'https://downloader.disk.yandex.ru/fixture'});
    return json({_embedded:{total:1,items:[item(path.slice(1))]}});
   }
   downloads++;return new Response(data);
  };
  const first=await syncLibrary({publicUrl:key,cacheDir,fetchImpl});
  assert.equal(first.status,'PASS');assert.equal(downloads,2);
  const second=await syncLibrary({publicUrl:key,cacheDir,fetchImpl});
  assert.equal(second.status,'PASS');assert.equal(downloads,2);
  assert.equal(second.folders[0].reused,1);
  assert.deepEqual(await readFile(join(cacheDir,'sources',FOLDERS[0],sha,'test.jpg')),data);
 }finally{await rm(cacheDir,{recursive:true,force:true});}
});
test('rejects non-Yandex URLs',async()=>{await assert.rejects(()=>listFolder('https://example.com/d/test',FOLDERS[0]));});
test('rejects corrupted downloads',async()=>{
 const cacheDir=await mkdtemp(join(tmpdir(),'persona-yandex-'));
 try{
  const fetchImpl=async url=>url.hostname!=='cloud-api.yandex.net'?new Response(Buffer.from('wrong bytes!!')):url.pathname.endsWith('/download')?json({href:'https://downloader.disk.yandex.ru/fixture'}):json({_embedded:{total:1,items:[item(url.searchParams.get('path').slice(1))]}});
  const r=await syncLibrary({publicUrl:key,cacheDir,fetchImpl});assert.equal(r.status,'PARTIAL');assert.equal(r.folders[0].errors.length,1);
 }finally{await rm(cacheDir,{recursive:true,force:true});}
});
