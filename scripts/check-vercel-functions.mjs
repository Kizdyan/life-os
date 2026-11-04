#!/usr/bin/env node
// Read-only check: Vercel treats each non-private JS/TS file under root /api
// as a serverless entrypoint, including innocently named *.test.ts files.
// Run in both GitHub CI and the Vercel build before TypeScript compilation.
import {readdir} from 'node:fs/promises';
import {join,relative,resolve,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const sourceExt=/\.(?:[cm]?[jt]s|[jt]sx)$/i;
const isPrivate=name=>name.startsWith('_')||name.startsWith('.')||name.endsWith('.d.ts');
const isTest=name=>/\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/i.test(name);

export async function scanVercelApi(apiDir){
 const entries=[];
 async function visit(dir){
  for(const item of await readdir(dir,{withFileTypes:true})){
   const path=join(dir,item.name);
   if(item.isDirectory()){await visit(path);continue;}
   // No symlink following. Ignore assets, README and type declarations.
   if(item.isFile()&&sourceExt.test(item.name)&&!item.name.endsWith('.d.ts'))
    entries.push({path,name:item.name});
  }
 }
 await visit(resolve(apiDir));
 return {
  functions:entries.filter(e=>!isPrivate(e.name)).map(e=>relative(apiDir,e.path)).sort(),
  leakedTests:entries.filter(e=>isTest(e.name)&&!isPrivate(e.name))
   .map(e=>relative(apiDir,e.path)).sort()
 };
}

export function assertVercelApiBudget(report,max=12){
 if(!report||!Array.isArray(report.functions)||!Array.isArray(report.leakedTests))
  throw Error('Invalid Vercel API preflight result');
 if(report.leakedTests.length)
  throw Error('Vercel would deploy test files as serverless endpoints: '+report.leakedTests.join(', ')+
   '. Prefix each test filename with _ or move it outside /api.');
 if(report.functions.length>max)
  throw Error('Vercel Hobby serverless function budget exceeded: '+report.functions.length+
   '/'+max+'. Consolidate/remove routes before preview deployment.');
 return report.functions.length;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 scanVercelApi(join(root,'api')).then(report=>{
  const count=assertVercelApiBudget(report);
  console.log('Persona Vercel API preflight: PASS '+count+'/12 routes; no test endpoints.');
 }).catch(error=>{console.error('Persona Vercel API preflight: FAIL '+error.message);process.exitCode=1});
}
