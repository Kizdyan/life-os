#!/usr/bin/env node
/** Prepare an isolated, non-destructive Remotion workspace with copied media. */
import {readFile,writeFile,mkdir,copyFile,lstat,realpath,cp} from 'node:fs/promises';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {exportRemotionHandoff} from './persona-remotion-handoff.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function stageRemotion({input,output}={}){
 const source=resolve(input),dir=resolve(output),base=dirname(source);
 const handoff=await exportRemotionHandoff({input:source,output:dir});
 const project=join(root,'integrations','remotion');
 await mkdir(join(dir,'public','media'),{recursive:true});
 for(const file of ['PersonaVertical.jsx','index.jsx','package.json']){
  await copyFile(join(project,file),join(dir,file));
 }
 for(const clip of handoff.clips){
  if(!/^[a-zA-Z0-9_./-]+$/.test(clip.source)||clip.source.split('/').includes('..')||
    clip.source.startsWith('/'))throw Error('Unsafe media source');
  const path=resolve(base,clip.source);
  const actual=await realpath(path),actualBase=await realpath(base);
  if(actual!==actualBase&&!actual.startsWith(actualBase+sep))throw Error('Source resolves outside media directory');
  if(!(await lstat(path)).isFile())throw Error('Source must be a regular file, not a symlink');
  const target=join(dir,'public','media',clip.source);
  await mkdir(dirname(target),{recursive:true});
  await copyFile(path,target,0);
 }
 return {status:'STAGED_NOT_RENDERED',output:dir,clips:handoff.clips.length,publicationApproved:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 if(!flag('--input')||!flag('--output')){console.error('Usage: node tools/persona-remotion-stage.mjs --input timeline.json --output NEW_DIR');process.exitCode=2}
 else stageRemotion({input:flag('--input'),output:flag('--output')}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
