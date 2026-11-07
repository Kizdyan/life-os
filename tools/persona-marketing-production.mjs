#!/usr/bin/env node
/**
 * One-command Persona marketing -> production pipeline.
 * Source CSV -> measured report -> editorial plan -> manifest.
 * Offline and read-only on source. No automatic publication.
 */
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parseCSV,analyze,markdown} from './persona-marketing-audit.mjs';
import {planExperiments,toMarkdown} from './persona-experiment-planner.mjs';
export async function buildMarketingProductionPack({input,output,weeklyPosts=3,productionMinutesPerWeek=240}){
 if(!input||!output)throw Error('CSV input and output directory required');
 const src=resolve(input),dir=resolve(output);
 if(dir===src||dir.startsWith(src+'/')||dir.startsWith(src+'\\'))throw Error('Output cannot be inside source file');
 const raw=await readFile(src,'utf8');
 if(Buffer.byteLength(raw)>5_000_000)throw Error('CSV over 5MB safety limit');
 const report=analyze(parseCSV(raw));
 const plan=planExperiments(report,{weeklyPosts,productionMinutesPerWeek});
 const files={
  'metrics.json':JSON.stringify(report,null,2)+'\n',
  'metrics.md':markdown(report),
  'production-plan.json':JSON.stringify(plan,null,2)+'\n',
  'production-plan.md':toMarkdown(plan)
 };
 const manifest={schemaVersion:1,kind:'persona-marketing-production-pack-v1',
  status:'DRAFT_AWAITING_AUTHOR_APPROVAL',inputSha256:createHash('sha256').update(raw).digest('hex'),
  inputRows:report.items.length,experiments:plan.experiments.length,
  publicationApproved:false,networkRequests:0,files:Object.keys(files)};
 await mkdir(dir,{recursive:true});
 // Refuse overwrites: preserve previous decisions and author review.
 for(const [name,body] of Object.entries({...files,'manifest.json':JSON.stringify(manifest,null,2)+'\n'}))
  await writeFile(join(dir,name),body,{flag:'wx'});
 return {output:dir,...manifest};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);const flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output');
 if(!input||!output){console.error('Usage: node tools/persona-marketing-production.mjs --input stats.csv --output new-output-dir [--posts 3] [--minutes 240]');process.exit(2)}
 buildMarketingProductionPack({input,output,weeklyPosts:flag('--posts')===undefined?3:Number(flag('--posts')),
  productionMinutesPerWeek:flag('--minutes')===undefined?240:Number(flag('--minutes'))})
  .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
