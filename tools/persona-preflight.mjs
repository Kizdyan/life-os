#!/usr/bin/env node
// Read-only environment preflight before running Persona locally.
import {spawnSync} from 'node:child_process';
import {connect} from 'node:net';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {existsSync} from 'node:fs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const checks=[];
function command(name,args){const p=spawnSync(name,args,{encoding:'utf8',timeout:10000,windowsHide:true});return {ok:p.status===0,detail:(p.stdout||p.stderr||p.error?.message||'').trim().split('\n')[0]}}
function check(label,ok,detail){checks.push({label,ok});console.log((ok?'PASS':'FAIL')+' '+label+(detail?' — '+detail:''))}
const nodeMajor=Number(process.versions.node.split('.')[0]);
check('Node.js >= 22',nodeMajor>=22,process.version);
for(const cmd of ['ffmpeg','ffprobe']){const p=command(cmd,['-version']);check(cmd+' available',p.ok,p.detail)}
for(const file of ['tools/persona-timeline-render.mjs','tools/persona-render-bridge.mjs','apps/web/index.html'])check(file,existsSync(resolve(root,file)));
function portFree(port){return new Promise(done=>{const socket=connect({host:'127.0.0.1',port});socket.once('connect',()=>{socket.destroy();done(false)});socket.once('error',e=>done(e.code==='ECONNREFUSED'));socket.setTimeout(1500,()=>{socket.destroy();done(false)})})}
for(const port of [47831,5173]){const free=await portFree(port);check('Port '+port+' available',free,free?'ready':'already in use or inaccessible')}
console.log('\n'+checks.filter(x=>x.ok).length+'/'+checks.length+' checks passed.');
if(checks.some(x=>!x.ok))process.exitCode=1;
