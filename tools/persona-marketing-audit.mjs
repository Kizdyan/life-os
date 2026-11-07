#!/usr/bin/env node
/**
 * Persona content experiments: deterministic, offline, privacy-minimizing analysis.
 * Input: CSV export with columns id,format,impressions,views,watch_seconds,
 * likes,comments,shares,saves,profile_visits,inquiries,production_minutes.
 * Never publishes, purchases, or sends data to third parties.
 */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';

export function parseCSV(src){
 const rows=[];let row=[],field='',quoted=false;
 for(let i=0;i<src.length;i++){const c=src[i];
  if(quoted){if(c==='"'&&src[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
  else if(c==='"'){if(field)throw Error('Invalid quote in CSV');quoted=true}
  else if(c===','){row.push(field);field=''}
  else if(c==='\n'){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field=''}
  else field+=c;
 }
 if(quoted)throw Error('Unclosed CSV quote');
 if(field||row.length){row.push(field);rows.push(row)}
 if(!rows.length)throw Error('Empty CSV');
 const headers=rows.shift().map(x=>x.trim().replace(/^\uFEFF/,''));
 if(new Set(headers).size!==headers.length)throw Error('Duplicate CSV header');
 return rows.filter(r=>r.some(x=>x.trim())).map((r,i)=>{
  if(r.length!==headers.length)throw Error('CSV column count mismatch at row '+(i+2));
  return Object.fromEntries(headers.map((h,j)=>[h,r[j].trim()]));
 });
}
const fields=['impressions','views','watch_seconds','likes','comments','shares','saves','profile_visits','inquiries','production_minutes'];
function count(row,key){const v=row[key];if(v===undefined||v==='')return null;
 const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('Invalid nonnegative '+key+' for '+row.id);
 return n;}
function ratio(a,b){return a===null||b===null||b<=0?null:Number((a/b).toFixed(5))}
export function analyze(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('At least one content row required');
 const ids=new Set();
 const items=rows.map((row,i)=>{
  const id=String(row.id??'').trim();if(!id||ids.has(id))throw Error('Missing/duplicate id at row '+(i+1));ids.add(id);
  const format=String(row.format??'').trim()||'unknown';
  const m=Object.fromEntries(fields.map(k=>[k,count(row,k)]));
  if(m.views!==null&&m.impressions!==null&&m.views>m.impressions)throw Error('views exceed impressions: '+id);
  const engagement=['likes','comments','shares','saves'].some(k=>m[k]===null)?null:['likes','comments','shares','saves'].reduce((a,k)=>a+m[k],0);
  return {id,format,metrics:m,rates:{
   viewRate:ratio(m.views,m.impressions),
   engagementPerView:ratio(engagement,m.views),
   avgWatchSeconds:ratio(m.watch_seconds,m.views),
   inquiryPerProfileVisit:ratio(m.inquiries,m.profile_visits),
   inquiriesPerProductionHour:ratio(m.inquiries,m.production_minutes===null?null:m.production_minutes/60)
  },warnings:[
   ...(m.impressions===null?['missing impressions']:[]),
   ...(m.views===null?['missing views']:[]),
   ...(m.inquiries===null?['missing inquiries']:[]),
   ...(m.production_minutes===null?['missing production time']:[])
  ]};
 });
 const totals=Object.fromEntries(fields.map(k=>[k,items.every(x=>x.metrics[k]!==null)?items.reduce((a,x)=>a+x.metrics[k],0):null]));
 const formats=[...new Set(items.map(x=>x.format))].sort().map(format=>{
  const subset=items.filter(x=>x.format===format);
  const aggregate=Object.fromEntries(fields.map(k=>[k,subset.every(x=>x.metrics[k]!==null)?subset.reduce((a,x)=>a+x.metrics[k],0):null]));
  return {format,count:subset.length,totals:aggregate,viewRate:ratio(aggregate.views,aggregate.impressions),
   inquiryPer1000Views:aggregate.inquiries===null||aggregate.views===null?null:ratio(aggregate.inquiries*1000,aggregate.views),
   inquiriesPerProductionHour:ratio(aggregate.inquiries,aggregate.production_minutes===null?null:aggregate.production_minutes/60)};
 });
 return {schemaVersion:1,status:'DESCRIPTIVE_ONLY_NOT_CAUSAL',items,totals,formats,
  limitations:['Rates with missing denominators are null, not zero','Small samples and platform attribution do not establish causality',
   'No claims about ROI without verified costs and revenue','No publishing or external API calls']};
}
export function markdown(report){
 const lines=['# Persona — content performance audit','','**Descriptive metrics only. Not a causal experiment.**','','| Format | Posts | Views | Inquiries | Inquiries / 1000 views | Inquiries / production hour |','|---|---:|---:|---:|---:|---:|'];
 for(const x of report.formats)lines.push('| '+x.format.replace(/\|/g,'/')+' | '+x.count+' | '+(x.totals.views??'n/a')+' | '+(x.totals.inquiries??'n/a')+' | '+(x.inquiryPer1000Views??'n/a')+' | '+(x.inquiriesPerProductionHour??'n/a')+' |');
 lines.push('','## Quality warnings','');
 for(const x of report.items)if(x.warnings.length)lines.push('- '+x.id+': '+x.warnings.join(', '));
 if(!report.items.some(x=>x.warnings.length))lines.push('No missing required measurement fields.');
 lines.push('','## Next action','','Compare formats on qualified inquiries per production hour, then design a controlled creative test. Do not infer causality from this table.','');
 return lines.join('\n');
}
export async function run({input,output}){
 const rows=parseCSV(await readFile(resolve(input),'utf8'));
 const report=analyze(rows);
 const dir=resolve(output);await mkdir(dir,{recursive:true});
 await writeFile(resolve(dir,'persona-marketing-report.json'),JSON.stringify(report,null,2)+'\n');
 await writeFile(resolve(dir,'persona-marketing-report.md'),markdown(report));
 return {rows:report.items.length,formats:report.formats.length,output:dir};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2);const input=args[args.indexOf('--input')+1],output=args[args.indexOf('--output')+1];
 if(!input||!output||input.startsWith('--')||output.startsWith('--')){console.error('Usage: node tools/persona-marketing-audit.mjs --input metrics.csv --output report-dir');process.exit(2)}
 run({input,output}).then(x=>console.log(JSON.stringify(x))).catch(e=>{console.error(e.message);process.exitCode=1});
}
