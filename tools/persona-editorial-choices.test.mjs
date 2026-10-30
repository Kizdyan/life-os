import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildCandidatePack,formatCandidatePack,createSelectionTemplate,applySelections,prepare,apply} from './persona-editorial-choices.mjs';

const brief={version:1,sourceFormat:'reel',
 script:[{order:1,line:'Я актёр. И ещё пишу музыку.'},{order:2,line:'И у нас есть проблема.'}],
 shots:[{order:1,action:'Крупный план'},{order:2,action:'Ответ за клавишами'}]};
const sha=n=>String(n).repeat(64);
function source(id,words,hashChar='a'){
 return {id,durationSec:4.5,hasAudio:true,sha256:sha(hashChar),
  technicalQuality:{warnings:[],blackIntervals:[]},
  segments:words.map(([text,startSec,endSec])=>({text,startSec,endSec,timing:'word'}))};
}
const aWords=[['Я',.2,.4],['актёр',.42,.74],['И',.8,.95],['ещё',1,1.2],['пишу',1.24,1.55],['музыку',1.62,1.95]];
const bWords=[['И',.25,.45],['у',.46,.57],['нас',.6,.85],['есть',.88,1.1],['проблема',1.14,1.67]];
const sources=[
 source('A01_take01',aWords,'a'),
 source('A01_take02',aWords,'b'),
 source('A01_take03',aWords,'c'),
 source('B01_take01',bWords,'d')
];
const evidence={version:1,kind:'persona-evidence-v1',
 sources:sources.map(({segments,...rest})=>rest)};
const decisions={version:1,analysisPath:'analysis.json',briefPath:'brief.json',
 choices:[{beat:1,sourceId:'A01_take02',startSec:.04,durationSec:2.09,transcript:'Я актёр И ещё пишу музыку',confidence:.91,reason:'original automatic selection'},
 {beat:2,sourceId:'B01_take01',startSec:.09,durationSec:1.76,transcript:'И у нас есть проблема',confidence:.91,reason:'original automatic selection'}]};

test('top three candidates prefer independent takes, without artistic rankings',()=>{
 const pack=buildCandidatePack(brief,sources,decisions);
 assert.equal(pack.beats[0].candidates.length,3);
 assert.equal(new Set(pack.beats[0].candidates.map(x=>x.sourceId)).size,3);
 assert.equal(pack.beats[1].candidates.length,1);
 assert.ok(pack.beats[0].candidates.every(x=>x.reason.includes('ASR text match')));
 assert.ok(!JSON.stringify(pack).includes('actingScore'));
 assert.equal(pack.status,'needs-human-review');
 assert.match(formatCandidatePack(pack),/выбор актёрских дублей/);
 assert.match(formatCandidatePack(pack),/A01_take01/);
 assert.equal(createSelectionTemplate(pack).status,'unreviewed');
});

test('manual switch produces new reviewed decisions and explicit preference memory',()=>{
 const pack=buildCandidatePack(brief,sources,decisions);
 const selection=createSelectionTemplate(pack);
 selection.selections[0]={beat:1,candidateId:pack.beats[0].candidates.find(x=>x.sourceId==='A01_take03').candidateId,
  reviewed:true,reason:'Лучший взгляд и естественная пауза',
  rejected:[{candidateId:pack.beats[0].candidates.find(x=>x.sourceId==='A01_take01').candidateId,reason:'Реакция слишком торопливая'}]};
 selection.selections[1].reviewed=true;
 selection.selections[1].reason='Сохраняем удачную интонацию';
 const {decisions:updated,memory}=applySelections(pack,selection,decisions,evidence,brief);
 assert.equal(updated.choices[0].sourceId,'A01_take03');
 assert.equal(updated.choices[1].sourceId,'B01_take01');
 assert.equal(memory.events[0].rejected[0].reason,'Реакция слишком торопливая');
 assert.equal(memory.publicationApproved,false);
 assert.ok(!('authorApproved' in updated));
 assert.equal(decisions.choices[0].sourceId,'A01_take02','do not mutate original decisions');
});

test('manual overrides reject unreviewed choices, unknown candidates and unsafe intervals',()=>{
 const pack=buildCandidatePack(brief,sources,decisions);
 const sel=createSelectionTemplate(pack);
 assert.throws(()=>applySelections(pack,sel,decisions,evidence,brief),/reviewed=true/);
 for(const row of sel.selections){row.reviewed=true;row.reason='Личный просмотр исходника';}
 const forged=structuredClone(sel);
 forged.selections[0].candidateId='invented';
 assert.throws(()=>applySelections(pack,forged,decisions,evidence,brief),/not in evidence pack/);
 const unexpected={...sel,approved:true};
 assert.throws(()=>applySelections(pack,unexpected,decisions,evidence,brief),/never carry publication approval/);
 const tamperedEvidence=structuredClone(evidence);
 tamperedEvidence.sources[0].sha256=sha('f');
 sel.selections[0].candidateId=pack.beats[0].candidates.find(x=>x.sourceId==='A01_take01').candidateId;
 assert.throws(()=>applySelections(pack,sel,decisions,tamperedEvidence,brief),/source or technical validation/);
 const blackEvidence=structuredClone(evidence);
 blackEvidence.sources[0].technicalQuality.blackIntervals=[{startSec:0,endSec:3,durationSec:3}];
 assert.throws(()=>applySelections(pack,sel,decisions,blackEvidence,brief),/source or technical validation/);
});

test('ASR recovery keeps recorded material available and stores a separately confirmed manual segment',()=>{
 const failedSources=[source('A01_take01',aWords,'a'),source('B01_take01',[],'d')];
 const pack=buildCandidatePack(brief,failedSources,decisions);
 assert.equal(pack.beats[1].candidates.length,0);
 assert.equal(pack.beats[1].recovery.status,'needs-transcript-review');
 assert.equal(pack.beats[1].recovery.availableSources[0].sourceId,'A01_take01');
 assert.match(formatCandidatePack(pack),/вручную проверить распознавание/);
 const selection=createSelectionTemplate(pack);
 selection.selections[0].reviewed=true;
 selection.selections[0].reason='Реплика слышна и подходит по реакции';
 selection.selections[1]={beat:2,candidateId:null,reviewed:true,
  reason:'Вручную отмечен фрагмент после прослушивания',rejected:[],
  recovery:{kind:'persona-manual-segment-v1',sourceId:'B01_take01',sourceSha256:sha('d'),
   startSec:.2,durationSec:1.7,transcript:'И у нас есть проблема',confirmed:true,
   reason:'Whisper не распознал фразу, автор проверил звук и границы'}};
 const {decisions:updated,memory}=applySelections(pack,selection,decisions,
  {kind:'persona-evidence-v1',sources:failedSources},brief);
 assert.equal(updated.choices[1].transcriptSource,'manual-review');
 assert.equal(updated.choices[1].confidence,null);
 assert.equal(updated.choices[1].manualTranscriptReview,true);
 assert.equal(memory.events[1].recovery,'manual-segment');
 const forged=structuredClone(selection);forged.selections[1].recovery.sourceSha256=sha('f');
 assert.throws(()=>applySelections(pack,forged,decisions,
  {kind:'persona-evidence-v1',sources:failedSources},brief),/manual recovery/);
});

test('partial Preview decisions can be fully reviewed into new strict montage without rerunning ASR',()=>{
 const asr=[source('A01_take01',aWords,'a'),source('B01_take01',[],'d')];
 const preview={version:1,mode:'preview',analysisPath:'analysis.json',briefPath:'brief.json',
  choices:[{beat:1,sourceId:'A01_take01',startSec:.04,durationSec:2.1}],
  missingBeats:[2]};
 const pack=buildCandidatePack(brief,asr,preview);
 assert.equal(pack.beats[1].candidates.length,0);
 const template=createSelectionTemplate(pack);
 template.selections[0].reviewed=true;template.selections[0].reason='Проверил лучший дубль';
 template.selections[1]={beat:2,candidateId:null,reviewed:true,
  reason:'Проверил звук и границы фразы вручную',rejected:[],
  recovery:{kind:'persona-manual-segment-v1',sourceId:'B01_take01',
   sourceSha256:sha('d'),startSec:.2,durationSec:1.7,
   transcript:'И у нас есть проблема',confirmed:true,reason:'Речь слышна на исходнике'}};
 const {decisions:updated}=applySelections(pack,template,preview,
  {kind:'persona-evidence-v1',sources:asr},brief);
 assert.equal(updated.mode,'strict');
 assert.deepEqual(updated.missingBeats,[]);
 assert.equal(updated.choices.length,2);
 assert.equal(updated.choices[1].transcriptSource,'manual-review');
 assert.equal(preview.choices.length,1,'original Preview decisions not mutated');
 const invalid={...preview,missingBeats:[]};
 assert.throws(()=>applySelections(pack,template,invalid,{kind:'persona-evidence-v1',sources:asr},brief),
  /schema mismatch/);
});

test('ASR recovery with no audio sources reports reshoot instead of offering a false manual transcript',()=>{
 const silent=[{...source('silent',[],'a'),hasAudio:false}];
 const pack=buildCandidatePack(brief,silent,{version:1,mode:'preview',choices:[],missingBeats:[1,2]});
 assert.ok(pack.beats.every(b=>b.recovery.availableSources.length===0));
 assert.match(formatCandidatePack(pack),/пересъёмка/);
});

test('cannot reuse overlapping source video intervals across two scene picks',()=>{
 const src=source('same',aWords,'a');
 const c1={beat:1,candidateId:'beat1-same',sourceId:'same',startSec:0,durationSec:2,transcript:'Я актёр',captionWords:[],confidence:.9,sourceSha256:sha('a')};
 const c2={beat:2,candidateId:'beat2-same',sourceId:'same',startSec:1,durationSec:2,transcript:'И проблема',captionWords:[],confidence:.9,sourceSha256:sha('a')};
 const pack={kind:'persona-editorial-candidate-pack-v1',beats:[
  {beat:1,candidates:[c1]},{beat:2,candidates:[c2]}]};
 const sel={kind:'persona-editorial-selection-v1',selections:[
  {beat:1,candidateId:c1.candidateId,reviewed:true,reason:'Снято удачно'},
  {beat:2,candidateId:c2.candidateId,reviewed:true,reason:'Снято удачно'}]};
 const analysis={kind:'persona-evidence-v1',sources:[src]};
 assert.throws(()=>applySelections(pack,sel,decisions,analysis,brief),/overlapping source intervals/);
});

test('file-based prepare/apply preserves original decisions and refuses overwrites',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-editorial-'));
 try{
  const analysisPath=join(dir,'analysis.json'),briefPath=join(dir,'brief.json'),decisionsPath=join(dir,'decisions.json'),
    packPath=join(dir,'candidate-pack.json'),selectionPath=join(dir,'selection.json'),updatedPath=join(dir,'reviewed-decisions.json'),
    memoryPath=join(dir,'review-memory.json');
  const localDecisions={...decisions,analysisPath,briefPath};
  await Promise.all([
   writeFile(analysisPath,JSON.stringify(evidence)),
   writeFile(briefPath,JSON.stringify(brief)),
   writeFile(decisionsPath,JSON.stringify(localDecisions)),
   ...sources.map(src=>writeFile(join(dir,src.id+'-whisper.json'),JSON.stringify({
    transcription:[{text:src.segments.map(w=>w.text).join(' '),
     offsets:{from:200,to:2050},
     tokens:src.segments.map(w=>({text:' '+w.text,offsets:{from:Math.round(w.startSec*1000),to:Math.round(w.endSec*1000)}}))}]
   })))
  ]);
  const prepared=await prepare({analysisPath,briefPath,decisionsPath,packPath,selectionPath});
  assert.deepEqual(prepared.candidateCounts,[3,1]);
  assert.match(await readFile(prepared.summaryPath,'utf8'),/B01_take01/);
  const proposal=JSON.parse(await readFile(selectionPath,'utf8'));
  for(const item of proposal.selections){item.reviewed=true;item.reason='Просмотрено вручную';}
  await writeFile(join(dir,'reviewed.json'),JSON.stringify(proposal));
  await apply({packPath,selectionPath:join(dir,'reviewed.json'),decisionsPath,outputPath:updatedPath,memoryPath});
  assert.equal(JSON.parse(await readFile(memoryPath,'utf8')).events.length,2);
  assert.deepEqual(JSON.parse(await readFile(decisionsPath,'utf8')),localDecisions);
  await assert.rejects(()=>apply({packPath,selectionPath:join(dir,'reviewed.json'),decisionsPath,outputPath:updatedPath,memoryPath}),/EEXIST/);
  await assert.rejects(()=>prepare({analysisPath,briefPath,decisionsPath,packPath,selectionPath}),/EEXIST/);
  const extraPack=join(dir,'candidate-pack-next.json');
  const protectedSelection=await readFile(selectionPath,'utf8');
  await assert.rejects(()=>prepare({analysisPath,briefPath,decisionsPath,packPath:extraPack,selectionPath}),/EEXIST/);
  assert.equal(await readFile(selectionPath,'utf8'),protectedSelection,'an existing human selection must never be deleted');
  await assert.rejects(()=>readFile(extraPack,'utf8'),/ENOENT/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
