#!/usr/bin/env node
/**
 * Offline evidence verification. No network, AI calls, publishing or execution.
 * Records SHA-256 of an existing local artifact, never asserts its quality.
 */
import {open,writeFile,mkdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,join,basename} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function inspectEvidence({input,maxBytes=25_000_000}={}){
 if(typeof input!=='string'||!input.trim())throw Error('Evidence input path required');
 const file=resolve(input);
 const handle=await open(file,constants.O_RDONLY | (constants.O_NOFOLLOW??0));
 let bytes;
 try{
  const before=await handle.stat();
  if(!before.isFile()||before.size===0||before.size>maxBytes)throw Error('Evidence file empty, oversized or not a regular file');
  bytes=await handle.readFile();
  const after=await handle.stat();
  if(bytes.length!==before.size||after.size!==before.size||after.mtimeMs!==before.mtimeMs)throw Error('Evidence changed while reading');
 }finally{await handle.close();}

 return {schemaVersion:1,kind:'LOCAL_FILE_HASH',fileName:basename(file),sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),verified:'FILE_BYTES_ONLY',qualityApproved:false};
}
export async function verifyEvidence({input,record}={}){
 if(!record||record.kind!=='LOCAL_FILE_HASH'||!/^[a-f0-9]{64}$/.test(record.sha256??'')||!Number.isSafeInteger(record.sizeBytes)||record.sizeBytes<1)throw Error('Invalid evidence record');
 const current=await inspectEvidence({input});
 return {status:current.sha256===record.sha256&&current.sizeBytes===record.sizeBytes?'MATCH':'MISMATCH',
  expectedSha256:record.sha256,actualSha256:current.sha256,qualityApproved:false};
}
export async function writeEvidence({input,output}={}){
 const record=await inspectEvidence({input});
 const dir=resolve(output);
 await mkdir(dir);
 await writeFile(join(dir,'evidence.json'),JSON.stringify({...record,createdAt:new Date().toISOString(),id:randomUUID()},null,2)+'\n',{flag:'wx'});
 return record;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output');
 if(!input||!output){console.error('Usage: node tools/persona-evidence.mjs --input EXISTING_FILE --output NEW_DIRECTORY');process.exitCode=2}
 else writeEvidence({input,output}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
