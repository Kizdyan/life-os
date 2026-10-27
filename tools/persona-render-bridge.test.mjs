import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';

test('local Persona bridge rejects invalid requests and accepts valid timeline sessions',async()=>{
 const port=48000+Math.floor(Math.random()*1000);
 const child=spawn(process.execPath,[resolve('tools/persona-render-bridge.mjs')],{env:{...process.env,PERSONA_RENDER_PORT:String(port)},stdio:'ignore'});
 const base='http://127.0.0.1:'+port;
 try{
  let ready=false;
  for(let i=0;i<40;i++){try{const r=await fetch(base+'/health');if(r.ok){ready=true;break}}catch{}await delay(100)}
  assert.ok(ready,'Local bridge did not start');
  const forbidden=await fetch(base+'/health',{headers:{Host:'untrusted.example'}});
  assert.equal(forbidden.status,403);
  const origin=await fetch(base+'/health',{headers:{Origin:'https://untrusted.example'}});
  assert.equal(origin.status,403);
  const invalid=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,clips:[]})});
  assert.equal(invalid.status,400);
  const valid=await fetch(base+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:1,width:1080,height:1920,fps:30,clips:[{startSec:0,durationSec:1},{startSec:0,durationSec:1}]})});
  assert.equal(valid.status,200);
  const data=await valid.json();
  assert.match(data.id,/^[0-9a-f-]{36}$/);
  const premature=await fetch(base+'/session/'+data.id+'/render',{method:'POST'});
  assert.equal(premature.status,400);
 }finally{child.kill();await delay(100)}
});
