#!/usr/bin/env node
/** Real existing Worker route, consent denied: never substitutes authored results. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createPersonaMediaWorker} from './persona-media-worker.mjs';
const out=resolve(process.env.PERSONA_NATIVE_PROBE_OUTPUT||'artifacts/persona-native-production');
await mkdir(out,{recursive:true});
// Explicit no-provider configuration. No keys, transport mocks or paid consent.
const worker=createPersonaMediaWorker({port:0,outputRoot:join(out,'worker'),apiEnv:{},ollamaModel:'qwen2.5:7b'});
try{
 const port=await worker.start(),base='http://127.0.0.1:'+port;
 const health=await(await fetch(base+'/health',{signal:AbortSignal.timeout(10000)})).json();
 const theme='Как «Птицы» создают напряжение без привычной оркестровой музыки?';
 const response=await fetch(base+'/carousel-research',{method:'POST',
  headers:{'Content-Type':'application/json','x-persona-worker-token':worker.token},
  body:JSON.stringify({theme,consent:false}),signal:AbortSignal.timeout(15000)});
 const body=await response.json();assert.equal(response.status,400);
 assert.match(body.error,/явное согласие/);assert.equal(health.carouselResearch.configured,false);
 const evidence={theme,route:'/carousel-research',transport:'real loopback HTTP; no mocked provider',
  research:'RESEARCH_BLOCKED',configured:false,paidConsent:false,httpStatus:response.status,error:body.error,
  modelsRun:[],actualPaidCalls:0,script:'NOT_RUN',images:'NOT_RUN',export:'NOT_RUN',
  autonomy:'NOT_PROVEN',reason:'No permission for a paid research request and no provider key configured in this isolated Worker.',
  manualSubstitution:false,publicationAllowed:false};
 await writeFile(join(out,'native-production-proof.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log('RESEARCH_BLOCKED: real Persona Worker denied unauthorized research; no invented downstream output');
}finally{await new Promise(ok=>worker.server.close(ok))}
