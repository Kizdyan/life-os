#!/usr/bin/env node
/**
 * Persona editorial selection: existing ASR evidence -> alternate takes ->
 * explicit human choice -> NEW decisions file for the existing assembler.
 * Local only; no AI calls, cloud uploads, publication or source modifications.
 */
import {readFile,writeFile,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseWhisperJson,rankDialogueCandidates} from './persona-semantic-autoselect.mjs';
import {overlapsBlackInterval} from './persona-take-qa.mjs';

const fail=message=>{throw Error(message)};
const valid=n=>typeof n==='number'&&Number.isFinite(n);
const readJson=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
const musicAfterSpeech=shot=>/(?:после реплики|после слов|затем).{0,90}(?:музык|мелод|фортепиан|клавиш|пианино)/iu.test(String(shot?.action||''));
function sourceById(sources){return new Map(sources.map(s=>[s.id,s]));}
function intersection(a,b){
 return a.sourceId===b.sourceId&&
 Math.min(a.startSec+a.durationSec,b.startSec+b.durationSec)-Math.max(a.startSec,b.startSec)>0.1;
}
function idFor(beat,c){
 return 'beat'+beat+'-'+c.sourceId+'-'+c.startSec.toFixed(3)+'-'+c.durationSec.toFixed(3);
}
function candidateFromRank(beat,rank,source,shot){
 let endSec=rank.endSec;
 if(musicAfterSpeech(shot)){
  if(!valid(shot.durationSec)||shot.durationSec<=0) return null;
  endSec=Math.max(endSec,rank.startSec+shot.durationSec);
 }
 if(endSec>source.durationSec+0.02) return null;
 const durationSec=Number((endSec-rank.startSec).toFixed(3));
 if(!valid(durationSec)||durationSec<0.25||durationSec>60) return null;
 if(overlapsBlackInterval(rank.startSec,rank.startSec+durationSec,source.technicalQuality?.blackIntervals))return null;
 if(rank.score<0.75) return null;
 const candidate={
  beat,sourceId:rank.sourceId,startSec:Number(rank.startSec.toFixed(3)),
  durationSec,transcript:rank.transcript,
  captionWords:rank.captionWords??[],confidence:Number(Math.max(0.65,Math.min(0.94,rank.score)).toFixed(3)),
  reason:'ASR text match '+Math.round(rank.coverage*100)+'%; technical and performance review required.',
  sourceSha256:source.sha256??null,
  technicalWarnings:source.technicalQuality?.warnings??[],
  evidenceFrames:source.frames??[]
 };
 candidate.candidateId=idFor(beat,candidate);
 return candidate;
}
function sameTakeWindow(a,b){
 return a.sourceId===b.sourceId&&
 Math.min(a.startSec+a.durationSec,b.startSec+b.durationSec)-Math.max(a.startSec,b.startSec)>=
 0.5*Math.min(a.durationSec,b.durationSec);
}
function recoveryForSources(sources){
 return {status:'needs-transcript-review',availableSources:sources.map(source=>({
  sourceId:source.id,sourceSha256:source.sha256??null,durationSec:source.durationSec,
  hasAudio:source.hasAudio===true,asrStatus:source.asrStatus??(source.segments?.length?'partial-or-unmatched':'unavailable')
 })),actions:['Просмотреть и прослушать локальный исходник','Сверить результат Whisper с речью','Вручную указать границы и текст фразы либо выбрать пересъёмку','Повторить монтаж только после явной проверки фрагмента'],
  note:'Ручная разметка хранится отдельно от Whisper и не доказывает автоматическую точность распознавания.'};
}
function manualRecovery(selected,source,beat){
 const item=selected?.recovery;
 if(!item||item.kind!=='persona-manual-segment-v1'||item.confirmed!==true||
    item.sourceId!==source?.id||item.sourceSha256!==source?.sha256||
    !valid(item.startSec)||item.startSec<0||!valid(item.durationSec)||item.durationSec<0.25||item.durationSec>60||
    item.startSec+item.durationSec>source.durationSec+0.02||typeof item.transcript!=='string'||
    item.transcript.trim().length<3||item.transcript.length>3000||typeof item.reason!=='string'||
    item.reason.trim().length<3||item.reason.length>500||source.hasAudio!==true||
    overlapsBlackInterval(item.startSec,item.startSec+item.durationSec,source.technicalQuality?.blackIntervals))
  fail('Invalid manual recovery for beat '+beat);
 return {beat,sourceId:source.id,startSec:Number(item.startSec.toFixed(3)),durationSec:Number(item.durationSec.toFixed(3)),
  transcript:item.transcript.trim(),captionWords:[],confidence:null,sourceSha256:source.sha256,
  transcriptSource:'manual-review',manualTranscriptReview:true,
  reason:item.reason.trim(),technicalWarnings:source.technicalQuality?.warnings??[]};
}
export function buildCandidatePack(brief,sources,planned=null){
 if(brief?.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||
    !Array.isArray(brief.shots)||brief.shots.length!==brief.script.length||
    brief.script.length<2||brief.script.length>30||!Array.isArray(sources))
  fail('Expected ordered Persona Reel brief and analyzed sources');
 const sourceMap=sourceById(sources),beats=[];
 if(sourceMap.size!==sources.length)fail('Duplicate evidence source IDs');
 for(let i=0;i<brief.script.length;i++){
  const beat=i+1,script=brief.script[i],shot=brief.shots[i];
  if(script?.order!==beat||shot?.order!==beat||typeof script.line!=='string')fail('Scene order mismatch');
  const options=sources.flatMap(source=>{
   if(!Array.isArray(source.segments)||!valid(source.durationSec))return [];
   return rankDialogueCandidates(script.line,source.id,source.segments)
    .map(rank=>candidateFromRank(beat,rank,source,shot))
    .filter(Boolean);
  }).sort((a,b)=>b.confidence-a.confidence||a.startSec-b.startSec);
  const selected=planned?.choices?.[i];
  // Keep the previous planner's choice when it remains a valid, ranked ASR window.
  let previous=selected&&options.find(option=>
   option.sourceId===selected.sourceId&&
   Math.abs(option.startSec-selected.startSec)<0.002&&
   Math.abs(option.durationSec-selected.durationSec)<0.002);
  const alternatives=[];
  if(previous)alternatives.push(previous);
  // Prefer independent takes over several overlapping variants of one utterance.
  for(const option of options){
   if(alternatives.length>=3)break;
   if(alternatives.some(x=>sameTakeWindow(x,option)))continue;
   alternatives.push(option);
  }
  beats.push({beat,scriptLine:script.line,defaultCandidateId:previous?.candidateId??alternatives[0]?.candidateId??null,
   candidates:alternatives,needsRecording:alternatives.length===0,
   ...(alternatives.length?{}:{recovery:recoveryForSources(sources)}),
   caveat:'Ranked by spoken-text coverage only; acting, humor, framing and color NOT scored.'});
 }
 return {version:1,kind:'persona-editorial-candidate-pack-v1',status:'needs-human-review',
  beats,notAnApproval:true,
  notice:'Options are evidence-based ASR proposals. Review video/audio before selecting. No author approval or publication is implied.'};
}
export function formatCandidatePack(pack){
 if(pack?.kind!=='persona-editorial-candidate-pack-v1'||!Array.isArray(pack.beats))
  fail('Invalid candidate pack');
 const lines=['# Persona · выбор актёрских дублей','',
  'Ранжирование здесь основано на совпадении текста с Whisper, а НЕ на качестве игры.',
  'Просмотрите оригинальное видео каждого кандидата и прослушайте звук перед выбором.',''];
 for(const beat of pack.beats){
  lines.push('## Сцена '+beat.beat+' — '+beat.scriptLine,'');
  if(!beat.candidates.length){
   lines.push('**Нет подходящего речевого фрагмента.** Нужна пересъёмка или Recovery Review: посмотреть исходник, вручную проверить распознавание Whisper и отдельно отметить границы/текст.','');
   continue;
  }
  beat.candidates.forEach((take,index)=>{
   lines.push('**Вариант '+(index+1)+(take.candidateId===beat.defaultCandidateId?' (автоматический черновой выбор)':'')+'**',
    '- Источник: '+take.sourceId,
    '- Время в исходнике: '+take.startSec.toFixed(2)+'–'+(take.startSec+take.durationSec).toFixed(2)+' с',
    '- Речь по Whisper: '+take.transcript,
    '- Технические замечания: '+(take.technicalWarnings.join(', ')||'нет автоматических предупреждений'),
    '- ID: '+take.candidateId,'');
  });
 }
 lines.push('## Как утвердить выбор','',
  'Откройте selection.json, для каждого кадра укажите candidateId, reviewed=true и причину выбора.',
  'Другие дубли добавляйте в rejected только с конкретной причиной; исходные видео не меняются.',
  'После выбора выполните команду apply для создания нового decisions.json.',
  'Файл не является разрешением на публикацию.','');
 return lines.join('\n');
}
export function createSelectionTemplate(pack){
 if(pack?.kind!=='persona-editorial-candidate-pack-v1')fail('Invalid candidate pack');
 return {version:1,kind:'persona-editorial-selection-v1',status:'unreviewed',
  selections:pack.beats.map(x=>({beat:x.beat,candidateId:x.defaultCandidateId,
   reviewed:false,reason:'',rejected:[],recovery:null})),
  notice:'Set reviewed=true and explain each scene choice after viewing the real footage. Does not approve publication.'};
}
export function applySelections(pack,selection,existing,analysis,brief){
 if(pack?.kind!=='persona-editorial-candidate-pack-v1'||selection?.kind!=='persona-editorial-selection-v1'||
    !Array.isArray(selection.selections)||!Array.isArray(pack.beats)||
    selection.selections.length!==pack.beats.length||
    existing?.version!==1||!Array.isArray(existing.choices)||
    existing.choices.length!==pack.beats.length||
    analysis?.kind!=='persona-evidence-v1'||!Array.isArray(analysis.sources)||
    brief?.version!==1||brief.script?.length!==pack.beats.length)
  fail('Candidate pack, selection, decisions or evidence schema mismatch');
 if(selection.approved!==undefined||selection.authorApproved!==undefined||selection.editorialApproved!==undefined)
  fail('Selection must never carry publication approval');
 const known=sourceById(analysis.sources),used=[],choices=[],events=[];
 for(let i=0;i<pack.beats.length;i++){
  const item=pack.beats[i],selected=selection.selections[i],beat=i+1;
  if(item.beat!==beat||brief.script[i]?.order!==beat||selected?.beat!==beat)
   fail('Selection scene ordering mismatch');
  if(selected.reviewed!==true||typeof selected.reason!=='string'||selected.reason.trim().length<3||
     selected.reason.length>500)fail('Manual selection needs reviewed=true and a real reason for beat '+beat);
  let found=item.candidates.find(c=>c.candidateId===selected.candidateId),manual=false;
  if(!found&&selected.recovery){
   const src=known.get(selected.recovery.sourceId);
   found=manualRecovery(selected,src,beat);manual=true;
  }
  if(!found)fail('Selected candidate not in evidence pack for beat '+beat);
  const src=known.get(found.sourceId);
  if(!src||src.sha256!==found.sourceSha256||!valid(found.startSec)||
     !valid(found.durationSec)||found.startSec<0||found.durationSec<0.25||
     found.startSec+found.durationSec>src.durationSec+0.02||
     (!manual&&(!valid(found.confidence)||found.confidence<0.65))||
     overlapsBlackInterval(found.startSec,found.startSec+found.durationSec,src.technicalQuality?.blackIntervals))
   fail('Selected candidate fails source or technical validation for beat '+beat);
  if(used.some(x=>intersection(x,found)))fail('Selected scenes reuse overlapping source intervals');
  used.push(found);
  const rejected=selected.rejected??[];
  if(!Array.isArray(rejected)||rejected.length>3)fail('Invalid rejected take notes');
  const rejectedEvents=rejected.map(r=>{
   if(!r||r.candidateId===selected.candidateId||!item.candidates.some(x=>x.candidateId===r.candidateId)||
       typeof r.reason!=='string'||r.reason.trim().length<3||r.reason.length>500)
    fail('Rejected candidate needs valid ID and reason for beat '+beat);
   return {candidateId:r.candidateId,reason:r.reason.trim()};
  });
  choices.push({beat,sourceId:found.sourceId,startSec:found.startSec,durationSec:found.durationSec,
   transcript:found.transcript,captionWords:found.captionWords,
   confidence:found.confidence,...(manual?{transcriptSource:'manual-review',manualTranscriptReview:true}:{}),
   reason:'Human reviewed take: '+selected.reason.trim()+
    (manual?'; source range and transcript were manually confirmed after ASR recovery; not an ASR accuracy claim.':'; ASR matched dialogue but acting quality not automatically assessed.')});
  events.push({beat,selectedCandidateId:found.candidateId,sourceId:found.sourceId,
   reason:selected.reason.trim(),rejected:rejectedEvents,sourceSha256:found.sourceSha256,
   ...(manual?{recovery:'manual-segment',manualTranscriptReview:true}:{})});
 }
 return {
  decisions:{version:1,analysisPath:existing.analysisPath,briefPath:existing.briefPath,choices},
  memory:{version:1,kind:'persona-creative-decisions-v1',status:'recorded-human-choices-not-model-training',
   events,publicationApproved:false,
   note:'Reasons come from explicit human review. No automated preference learning or artistic quality claims.'}
 };
}
export async function prepare({analysisPath,briefPath,decisionsPath,packPath,selectionPath}={}){
 if(![analysisPath,briefPath,decisionsPath,packPath,selectionPath].every(x=>typeof x==='string'&&x.trim()))
  fail('Usage: prepare analysis.json brief.json decisions.json new-pack.json new-selection.json');
 const [analysis,brief,planned]=await Promise.all([readJson(analysisPath),readJson(briefPath),readJson(decisionsPath)]);
 if(analysis?.kind!=='persona-evidence-v1'||!Array.isArray(analysis.sources))fail('Expected Persona evidence');
 const sources=[];
 for(const src of analysis.sources){
  const path=join(dirname(resolve(analysisPath)),src.id+'-whisper.json');
  let segments=[],asrStatus=src.hasAudio?'transcript-unavailable':'no-audio';
  if(src.hasAudio)try{segments=parseWhisperJson(await readJson(path),src.durationSec);asrStatus=segments.length?'available':'empty';}catch{}
  sources.push({...src,segments,asrStatus});
 }
 const pack=buildCandidatePack(brief,sources,planned);
 pack.analysisPath=resolve(analysisPath);pack.briefPath=resolve(briefPath);pack.decisionsPath=resolve(decisionsPath);
 const template=createSelectionTemplate(pack);
 const summaryPath=resolve(packPath)+'.md';
 await writeFile(resolve(packPath),JSON.stringify(pack,null,2)+'\n',{flag:'wx'});
 let selectionCreated=false;
 try{
  await writeFile(resolve(selectionPath),JSON.stringify(template,null,2)+'\n',{flag:'wx'});
  selectionCreated=true;
  await writeFile(summaryPath,formatCandidatePack(pack),{flag:'wx'});
 }catch(e){
  await rm(resolve(packPath),{force:true});
  if(selectionCreated)await rm(resolve(selectionPath),{force:true});
  throw e;
 }
 return {packPath:resolve(packPath),summaryPath,selectionPath:resolve(selectionPath),
  beats:pack.beats.length,candidateCounts:pack.beats.map(x=>x.candidates.length),
  next:'Review the clips, edit selection JSON, then run apply. No publication approval.'};
}
export async function apply({packPath,selectionPath,decisionsPath,outputPath,memoryPath}={}){
 if(![packPath,selectionPath,decisionsPath,outputPath,memoryPath].every(x=>typeof x==='string'&&x.trim()))
  fail('Usage: apply pack.json reviewed-selection.json original-decisions.json new-decisions.json new-memory.json');
 const [pack,selection,existing]=await Promise.all([readJson(packPath),readJson(selectionPath),readJson(decisionsPath)]);
 if(resolve(pack.decisionsPath)!==resolve(decisionsPath))fail('Pack does not match existing decisions');
 const [analysis,brief]=await Promise.all([readJson(pack.analysisPath),readJson(pack.briefPath)]);
 const result=applySelections(pack,selection,existing,analysis,brief);
 await writeFile(resolve(outputPath),JSON.stringify(result.decisions,null,2)+'\n',{flag:'wx'});
 try{await writeFile(resolve(memoryPath),JSON.stringify(result.memory,null,2)+'\n',{flag:'wx'});}
 catch(e){await rm(resolve(outputPath),{force:true});throw e;}
 return {decisionsPath:resolve(outputPath),memoryPath:resolve(memoryPath),
  status:'needs-final-creative-review',publicationApproved:false};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [action,a,b,c,d,e]=process.argv.slice(2);
 const operation=action==='prepare'?prepare({analysisPath:a,briefPath:b,decisionsPath:c,packPath:d,selectionPath:e}):
  action==='apply'?apply({packPath:a,selectionPath:b,decisionsPath:c,outputPath:d,memoryPath:e}):null;
 if(!operation){console.error('Usage: prepare <analysis> <brief> <decisions> <new-pack> <new-selection> | apply <pack> <selection> <decisions> <new-decisions> <new-memory>');process.exitCode=2;}
 else operation.then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error('Persona editorial:',e.message);process.exitCode=1});
}
