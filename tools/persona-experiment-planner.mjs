#!/usr/bin/env node
/**
 * Persona editorial experiment planner.
 * Reads descriptive marketing report and creates an actionable, human-approved
 * production experiment queue. Does not generate invented metrics or publish.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const n=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const fmt=x=>String(x??'').replace(/[|\r\n]/g,' ').trim().slice(0,80);
export function planExperiments(report,{weeklyPosts=3,productionMinutesPerWeek=240}={}){
 if(report?.schemaVersion!==1||report.status!=='DESCRIPTIVE_ONLY_NOT_CAUSAL'||!Array.isArray(report.formats)||!Array.isArray(report.items))throw Error('Expected Persona descriptive marketing report');
 if(!Number.isInteger(weeklyPosts)||weeklyPosts<1||weeklyPosts>7)throw Error('weeklyPosts must be 1..7');
 if(!n(productionMinutesPerWeek)||productionMinutesPerWeek<30||productionMinutesPerWeek>10080)throw Error('Invalid production budget');
 const rows=report.formats.map(x=>{
  const views=x?.totals?.views,inquiries=x?.totals?.inquiries,time=x?.totals?.production_minutes;
  const enough=Number.isInteger(x.count)&&x.count>=3&&n(views)&&views>=300&&n(inquiries)&&n(time)&&time>0;
  return {format:fmt(x.format)||'unknown',posts:x.count??0,views:views??null,inquiries:inquiries??null,
   productionMinutes:time??null,eligibleForComparison:enough,
   inquiryRate:enough?Number((inquiries*1000/views).toFixed(4)):null,
   inquiriesPerHour:enough?Number((inquiries*60/time).toFixed(4)):null,
   evidence:enough?'DESCRIPTIVE_SAMPLE':'INSUFFICIENT_OR_MISSING_DATA'};
 }).sort((a,b)=>(b.inquiriesPerHour??-1)-(a.inquiriesPerHour??-1)||a.format.localeCompare(b.format));
 const leader=rows.find(x=>x.eligibleForComparison)??null;
 const ideas=[
  {id:'EXP-01',title:'Hook clarity',variable:'First 2 seconds: question vs direct statement',metric:'qualified inquiries per 1000 views',
   constraint:'Keep duration, topic, camera, CTA and publication window as comparable as possible'},
  {id:'EXP-02',title:'Performance format',variable:'Direct-to-camera vs acted micro-scene',metric:'qualified inquiries per production hour',
   constraint:'Keep offer and call-to-action consistent'},
  {id:'EXP-03',title:'Music-led identity',variable:'With original piano motif vs spoken-only introduction',metric:'qualified inquiries per 1000 views',
   constraint:'Use only owned or licensed music; keep the creative proposition comparable'}
 ];
 const perVideo=Math.floor(productionMinutesPerWeek/weeklyPosts);
 const experiments=ideas.slice(0,Math.min(weeklyPosts,3)).map((idea,i)=>({
  ...idea,status:'DRAFT_AWAITING_AUTHOR_APPROVAL',publicationApproved:false,weekSlot:i+1,
  maxProductionMinutes:perVideo,
  shotBrief:{
   durationSeconds:'20–50',orientation:'9:16',roles:'One performer',location:'One controllable location',
   opening:'Prepare two versions of the specified variable; do not change other elements unnecessarily',
   filming:'Record A/B takes, clean dialogue, room tone and optional approved B-roll',
   editing:'Export 1080x1920 MP4, subtitles and a side-by-side comparison',
   qualityGate:'Check black frames, voice intelligibility, skin tone, glasses, subtitle timing and rights',
   approval:'Human selects concept, approves cut and explicitly authorizes publication'
  }
 }));
 return {schemaVersion:1,kind:'persona-editorial-experiment-plan-v1',status:'DRAFT_NOT_PUBLISHED',
  generatedAt:new Date().toISOString(),inputs:{weeklyPosts,productionMinutesPerWeek,sourceRows:report.items.length},
  evidence:{formatComparisons:rows,observedLeader:leader?.format??null,
   warning:leader?'Observed format performance is correlational, not proof of superiority':'No format meets the minimum comparison gate'},
  experiments,publicationApproved:false,externalActionsPerformed:0};
}
export function toMarkdown(plan){
 const lines=['# Persona — производственный план экспериментов','',
  '**Статус:** черновик; публикация не разрешена.','','## Что известно из данных','',
  plan.evidence.warning,'',
  '| Формат | Публикаций | Просмотров | Обращений | Обращений/час производства | Достаточно данных |',
  '|---|---:|---:|---:|---:|---|'];
 for(const r of plan.evidence.formatComparisons)lines.push(`| ${r.format.replace(/\|/g,'/')} | ${r.posts} | ${r.views??'н/д'} | ${r.inquiries??'н/д'} | ${r.inquiriesPerHour??'н/д'} | ${r.eligibleForComparison?'да':'нет'} |`);
 lines.push('','## План съёмки','','Бюджет: '+plan.inputs.productionMinutesPerWeek+' мин/неделю; публикаций: '+plan.inputs.weeklyPosts+'.','');
 for(const e of plan.experiments)lines.push('### '+e.id+' — '+e.title,'',
  '**Проверяем:** '+e.variable,'','**Метрика:** '+e.metric,'','**Контроль:** '+e.constraint,'',
  '**Время:** до '+e.maxProductionMinutes+' минут.','',
  '**Съёмка:** '+e.shotBrief.filming,'','**Монтаж:** '+e.shotBrief.editing,'',
  '**Контроль качества:** '+e.shotBrief.qualityGate,'','**Решение:** только после просмотра автором.','');
 return lines.join('\n');
}
export async function run({input,output,weeklyPosts=3,productionMinutesPerWeek=240}){
 const report=JSON.parse(await readFile(resolve(input),'utf8'));
 const plan=planExperiments(report,{weeklyPosts,productionMinutesPerWeek});
 const dir=resolve(output);await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'persona-experiment-plan.json'),JSON.stringify(plan,null,2)+'\n');
 await writeFile(join(dir,'persona-experiment-plan.md'),toMarkdown(plan));
 return {experiments:plan.experiments.length,output:dir,status:plan.status};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);
 const flag=x=>{const i=args.indexOf(x);return i<0?undefined:args[i+1]};
 const input=flag('--input'),output=flag('--output');
 if(!input||!output){console.error('Usage: node tools/persona-experiment-planner.mjs --input persona-marketing-report.json --output output-dir [--posts 3] [--minutes 240]');process.exit(2)}
 run({input,output,weeklyPosts:flag('--posts')===undefined?3:Number(flag('--posts')),
 productionMinutesPerWeek:flag('--minutes')===undefined?240:Number(flag('--minutes'))})
 .then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
