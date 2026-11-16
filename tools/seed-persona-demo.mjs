#!/usr/bin/env node
/**
 * Create a file-backed PREPARING ProductionJob for local Worker testing.
 * This does NOT update the browser's localStorage or any cloud database.
 * Link the browser copy using #persona/demo on the deployed Persona website.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProductionJob} from './persona_orchestrator.mjs';

const fixture=JSON.parse(await readFile(new URL('../packages/core/src/persona-demo-project.json',import.meta.url),'utf8'));
export const defaultRoot=join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'LifeOS','Persona','demo-jobs');

export async function seedDemoProductionJob(outputRoot=defaultRoot){
 if(typeof outputRoot!=='string'||!outputRoot.trim())throw Error('output root is required');
 const root=resolve(outputRoot);
 await mkdir(root,{recursive:true});
 const directory=join(root,fixture.id);
 let job,created=false;
 try{
  job=await ProductionJob.create(directory,{title:fixture.title});
  created=true;
 }catch(error){
  if(error?.code!=='EEXIST')throw error;
  job=new ProductionJob(directory);
 }
 const state=await job.read();
 if(state.title!==fixture.title||state.status!=='PREPARING')
  throw Error('Existing ProductionJob is not the expected PREPARING demo; no changes made');
 const scriptPath=join(directory,'output','demo-script.json');
 const shotsPath=join(directory,'output','demo-shot-list.json');
 const manifestPath=join(directory,'output','demo-manifest.json');
 if(created){
  const metadata={version:1,demo:true,approved:false,footageAvailable:false,productionJobId:state.id,
   productionJobStatus:state.status,script:'demo-script.json',shotList:'demo-shot-list.json'};
  await writeFile(scriptPath,JSON.stringify({version:1,demo:true,approved:false,scenes:fixture.scenes},null,2)+'\n',{flag:'wx'});
  await writeFile(shotsPath,JSON.stringify({version:1,demo:true,approved:false,shots:fixture.shots},null,2)+'\n',{flag:'wx'});
  await writeFile(manifestPath,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});
 }else{
  // An existing job is never modified, even if incomplete: fail closed.
  const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
  if(!manifest.demo||manifest.productionJobId!==state.id)throw Error('Existing demo manifest does not match job');
 }
 return {created,jobId:state.id,status:state.status,directory,scriptPath,shotsPath,manifestPath,
  scenes:fixture.scenes.length,shots:fixture.shots.length};
}

const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const args=process.argv.slice(2);
 if(args.length!==0&&!(args.length===2&&args[0]==='--output-root')){
  console.error('Usage: node tools/seed-persona-demo.mjs [--output-root ABSOLUTE_PATH]');
  process.exitCode=2;
 }else{
  try{
   const value=await seedDemoProductionJob(args.length?args[1]:defaultRoot);
   console.log(JSON.stringify(value,null,2));
  }catch(error){
   console.error('Demo seed failed:',error.message);
   process.exitCode=1;
  }
 }
}
