import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCSV,analyze,markdown,run} from './persona-marketing-audit.mjs';
const csv='id,format,impressions,views,watch_seconds,likes,comments,shares,saves,profile_visits,inquiries,production_minutes\nA,reel,1000,500,4500,30,4,5,6,20,2,60\nB,reel,500,250,2000,10,2,1,2,10,1,30\nC,photo,300,200,0,5,1,0,0,5,0,10\n';
test('CSV parser handles quoted commas, newlines and BOM',()=>{
 assert.deepEqual(parseCSV('\uFEFFid,format\n"A,1","reel,vertical"\n')[0],{id:'A,1',format:'reel,vertical'});
 assert.throws(()=>parseCSV('id,id\na,b\n'),/Duplicate/);
 assert.throws(()=>parseCSV('id,format\na\n'),/column count/);
 assert.throws(()=>parseCSV('id\n"oops'),/Unclosed/);
});
test('weighted metrics and production efficiency are computed from totals',()=>{
 const report=analyze(parseCSV(csv));assert.equal(report.items.length,3);
 const reel=report.formats.find(x=>x.format==='reel');
 assert.equal(reel.totals.views,750);assert.equal(reel.totals.inquiries,3);
 assert.equal(reel.inquiryPer1000Views,4);
 assert.equal(reel.inquiriesPerProductionHour,2);
 assert.equal(reel.viewRate,0.5);
 assert.equal(report.status,'DESCRIPTIVE_ONLY_NOT_CAUSAL');
 assert.match(markdown(report),/production hour/);
});
test('missing data stays null and is not silently counted as zero',()=>{
 const report=analyze([{id:'A',views:'100',impressions:'200',inquiries:'',production_minutes:''}]);
 assert.equal(report.items[0].metrics.inquiries,null);
 assert.equal(report.formats[0].inquiryPer1000Views,null);
 assert.ok(report.items[0].warnings.includes('missing inquiries'));
});
test('rejects impossible, negative and duplicated metrics',()=>{
 assert.throws(()=>analyze([{id:'a',views:'101',impressions:'100'}]),/exceed/);
 assert.throws(()=>analyze([{id:'a',views:'-1'}]),/Invalid/);
 assert.throws(()=>analyze([{id:'a'},{id:'a'}]),/duplicate/);
});
test('creates both machine-readable and human reports from CSV',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-marketing-'));
 try{
  const input=join(dir,'input.csv'),output=join(dir,'reports');
  await writeFile(input,csv);
  const result=await run({input,output});assert.equal(result.rows,3);
  const json=JSON.parse(await readFile(join(output,'persona-marketing-report.json'),'utf8'));
  assert.equal(json.formats.length,2);
  assert.match(await readFile(join(output,'persona-marketing-report.md'),'utf8'),/Persona/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
