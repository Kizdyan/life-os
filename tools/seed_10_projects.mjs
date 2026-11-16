#!/usr/bin/env node
/**
 * Seed the Architect's 10 Reels as file-backed ProductionJobs (WAITING_FOR_FOOTAGE).
 * Separately write a browser-seed manifest; #persona/seed10 imports the same
 * fixture into that browser's own localStorage. A Node script cannot write into
 * a different device's browser storage without opening that site's origin.
 *
 * Optional --browser-profile <DIR> uses an explicit dedicated persistent
 * Playwright Chromium profile to visit that hash and VERIFY all 10 entries.
 * It does not modify the user's existing default Chrome profile.
 */
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename,rm,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {ProductionJob} from './persona_orchestrator.mjs';
import {validateArchitectIdeas} from '../packages/core/src/persona-architect-shot-parser.mjs';
import {strategyForArchitect,isPersonaStrategy} from '../packages/core/src/persona-strategy.mjs';

const ideas=JSON.parse(await readFile(new URL('../packages/core/src/persona-architect-ten-reels.json',import.meta.url),'utf8'));
const validated=validateArchitectIdeas(ideas);
export const defaultArchitectRoot=join(process.env.LOCALAPPDATA||join(homedir(),'.local','share'),'LifeOS','Persona','architect-jobs');
export const architectImportHash='#persona/seed10';
const toJson=value=>JSON.stringify(value,null,2)+'\n';
const sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function readJson(file){return JSON.parse(await readFile(file,'utf8'))}
async function assertExisting(directory,entry,sourceSha){
 const job=new ProductionJob(directory);
 const state=await job.read();
 const manifest=await readJson(join(directory,'output','architect-manifest.json'));
 const source=await readJson(join(directory,'input','architect-source.json'));
 const shots=await readJson(join(directory,'output','architect-shot-list.json'));
 const expectedStrategy=strategyForArchitect(entry.item);
 if(state.status!=='WAITING_FOR_FOOTAGE'||state.title!==entry.item.title||
   manifest.version!==1||manifest.sourceId!==entry.item.id||
   manifest.sourceSha256!==sourceSha||manifest.productionJobId!==state.id||
   manifest.editorialApproved!==false||manifest.footageAvailable!==false||
   (state.strategy!==undefined&&JSON.stringify(state.strategy)!==JSON.stringify(expectedStrategy))||
   (shots.strategy!==undefined&&JSON.stringify(shots.strategy)!==JSON.stringify(expectedStrategy))||
   sha(source)!==sourceSha||
   shots.sourceId!==entry.item.id||shots.shots.length!==entry.scenes.length)
  throw Error('Existing project differs from the seed or was edited: '+entry.item.id+'; refusing to overwrite');
 return {sourceId:entry.item.id,jobId:state.id,title:state.title,status:state.status,directory,created:false,shots:shots.shots.length,strategyStored:Boolean(state.strategy)};
}

async function seedOne(root,entry){
 const {item,scenes}=entry,shaSource=sha(item);
 const directory=join(root,item.id);
 // Check the directory's existence separately from validating its contents.
 // A missing manifest inside an *existing* job is not permission to recreate it.
 let directoryExists=false;
 try{await access(directory);directoryExists=true}
 catch(error){if(error?.code!=='ENOENT')throw error}
 if(directoryExists){
  try{return await assertExisting(directory,entry,shaSource)}
  catch(error){throw Error('Existing project differs from the seed or was edited: '+item.id+'; refusing to overwrite ('+String(error?.message||error)+')')}
 }
 const staging=join(root,'.pending-'+item.id+'-'+randomUUID());
 let createdStage=false;
 try{
  const strategy=strategyForArchitect(item);
  const job=await ProductionJob.create(staging,{title:item.title,strategy});createdStage=true;
  const status=await job.read();
  const shots=scenes.map(scene=>({
   order:scene.order,startSec:scene.startSec,endSec:scene.endSec,durationSec:scene.durationSec,
   action:scene.action,source:'architect-mainShots',mediaStatus:'awaiting_author_footage',
  }));
  await writeFile(join(staging,'input','architect-source.json'),toJson(item),{flag:'wx'});
  await writeFile(join(staging,'output','architect-shot-list.json'),toJson({
   version:1,sourceId:item.id,editorialApproved:false,strategy,shots,brollIdeas:item.broll,
   musicalDirection:item.music,requestedDuration:item.duration,
  }),{flag:'wx'});
  await writeFile(join(staging,'output','architect-manifest.json'),toJson({
   version:1,sourceId:item.id,sourceSha256:shaSource,productionJobId:status.id,
   editorialApproved:false,footageAvailable:false,
   requestedStatus:'WAITING_FOR_FOOTAGE',source:'input/architect-source.json',
   shotList:'output/architect-shot-list.json',
  }),{flag:'wx'});
  // Explicitly use the orchestrator's legal PREPARING -> WAITING_FOR_FOOTAGE
  // transition without implying that the author approved the creative brief.
  const waiting=await job.transition('WAITING_FOR_FOOTAGE',{
   reason:'Architect brief imported for planning only; footage missing; editorial approval remains pending',
  });
  await rename(staging,directory);
  return {sourceId:item.id,jobId:waiting.id,title:waiting.title,status:waiting.status,directory,created:true,shots:shots.length,strategyStored:isPersonaStrategy(waiting.strategy)};
 }catch(error){
  if(createdStage)await rm(staging,{recursive:true,force:true}).catch(()=>{});
  throw error;
 }
}
async function saveBrowserInstructions(root){
 const instructions={version:1,kind:'persona-architect-browser-seed-v1',
  hash:architectImportHash,storageKey:'lifeos:persona:projects:v1',
  // The browser's origin must be visited explicitly; this is not a server-side DB.
  action:'Open https://YOUR_PERSONA_SITE/#persona/seed10 on each device/browser that needs the cards',
  total:ideas.length,sourceIds:ideas.map(x=>x.id),statuses:ideas.map(x=>'WAITING_FOR_FOOTAGE'),
 };
 const path=join(root,'browser-seed-instructions.json');
 try{await writeFile(path,toJson(instructions),{flag:'wx'})}
 catch(error){if(error?.code!=='EEXIST')throw error;const existing=await readJson(path);if(JSON.stringify(existing)!==JSON.stringify(instructions))throw Error('browser instructions edited: refuse overwrite')}
 return path;
}

export async function seedTenProductionJobs(outputRoot=defaultArchitectRoot){
 if(typeof outputRoot!=='string'||!outputRoot.trim())throw Error('Seed root is required');
 const root=resolve(outputRoot);
 await mkdir(root,{recursive:true});
 const jobs=[];
 for(const entry of validated)jobs.push(await seedOne(root,entry));
 if(jobs.length!==10||jobs.some(job=>job.status!=='WAITING_FOR_FOOTAGE'))throw Error('Seed not complete');
 const browserManifest=await saveBrowserInstructions(root);
 return {root,created:jobs.filter(j=>j.created).length,existing:jobs.filter(j=>!j.created).length,
  count:jobs.length,allWaitingForFootage:true,browserManifest,importHash:architectImportHash,jobs};
}

export async function seedBrowserInDedicatedProfile({profileDir,siteUrl}){
 if(typeof profileDir!=='string'||!profileDir.trim())throw Error('explicit browser profile directory required');
 const url=new URL(siteUrl);
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))
  throw Error('Site must use HTTPS, or local HTTP only for localhost');
 const {chromium}=await import('playwright');
 const context=await chromium.launchPersistentContext(resolve(profileDir),{headless:true});
 try{
  const page=context.pages()[0]||await context.newPage();
  await page.goto(url.origin+url.pathname+url.search+architectImportHash,{waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('.personaProjectList').waitFor({timeout:25000});
  const saved=await page.evaluate(()=>{
   const store=JSON.parse(localStorage.getItem('lifeos:persona:projects:v1')||'null');
   return store?.projects?.filter(p=>/^reel-(?:0[1-9]|10)$/.test(p.id)).map(p=>({
    id:p.id,title:p.title,stage:p.stage,shots:p.shootingPlan?.materials?.shotList?.length||0,
   }))||[];
  });
  if(saved.length!==10||saved.some(p=>p.stage!=='needs_assets'||p.shots!==5))
   throw Error('Browser did not persist all 10 seeded projects');
  return {profileDir:resolve(profileDir),origin:url.origin,projects:saved.length};
 }finally{await context.close()}
}

const invoked=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
 const args=process.argv.slice(2);
 const parsed={};
 try{
  for(let i=0;i<args.length;i+=2){
   if(!['--output-root','--browser-profile','--site-url'].includes(args[i])||!args[i+1]||Object.hasOwn(parsed,args[i]))
    throw Error('Usage: node tools/seed_10_projects.mjs [--output-root PATH] [--browser-profile PATH --site-url URL]');
   parsed[args[i]]=args[i+1];
  }
  if(Boolean(parsed['--browser-profile'])!==Boolean(parsed['--site-url']))throw Error('--browser-profile and --site-url must be passed together');
  const result=await seedTenProductionJobs(parsed['--output-root']||defaultArchitectRoot);
  if(parsed['--browser-profile']){
   result.browser=await seedBrowserInDedicatedProfile({profileDir:parsed['--browser-profile'],siteUrl:parsed['--site-url']});
  }
  console.log(toJson(result));
 }catch(error){console.error('TEN_REELS_SEED_FAILED:',error?.message||String(error));process.exitCode=1}
}
