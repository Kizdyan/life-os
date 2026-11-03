/**
 * Persona ASR recovery diagnostics for actual local Whisper JSON-full output.
 *
 * Compares the *reported* words to the script, without pretending the ASR
 * transcript proves what a real human/TTS voice said. NEVER approves editing,
 * changes match thresholds, modifies media or generates a substitute MP4.
 */
import {createHash} from 'node:crypto';
import {lstat,readFile,realpath,writeFile} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {parseWhisperJson} from './persona-semantic-autoselect.mjs';

const fail=m=>{throw Error('Persona ASR recovery: '+m)};
const saneId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(id);
const normalize=s=>String(s??'').normalize('NFKC').toLocaleLowerCase('ru-RU')
 .replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const tokens=s=>normalize(s).split(/\s+/u).filter(Boolean);
const inside=(root,file)=>{
 const path=relative(root,file);
 return path===''||(path!=='..'&&!path.startsWith('..'+sep)&&!isAbsolute(path));
};
function charSimilarity(a,b){
 const x=Array.from(normalize(a).slice(0,180)),y=Array.from(normalize(b).slice(0,180));
 if(!x.length||!y.length)return 0;
 let prev=Array.from({length:y.length+1},(_,i)=>i);
 for(let i=0;i<x.length;i++){
  const now=[i+1];
  for(let j=0;j<y.length;j++)
   now.push(Math.min(prev[j+1]+1,now[j]+1,prev[j]+(x[i]===y[j]?0:1)));
  prev=now;
 }
 return Number(Math.max(0,1-prev[y.length]/Math.max(x.length,y.length)).toFixed(3));
}
function wordDifferences(expected,reported){
 const a=tokens(expected),b=tokens(reported);
 // Only display a word-by-word comparison for equal-length sequences.
 // Different lengths require listening; simplistic positional alignment lies.
 if(a.length!==b.length)return {expectedWords:a,heardByAsr:b,alignment:'unavailable-different-word-count'};
 return {expectedWords:a,heardByAsr:b,alignment:'position-only',
  differingPositions:a.map((word,i)=>word===b[i]?null:{
   position:i+1,expected:word,asrReported:b[i],
  }).filter(Boolean)};
}
function bestWindows(line,source){
 const fragments=source.segments;
 if(!Array.isArray(fragments)||!fragments.length)return [];
 const expected=tokens(line),maxWindow=Math.min(10,Math.max(4,expected.length+2));
 const candidates=[];
 for(let i=0;i<Math.min(fragments.length,400);i++){
  for(let len=1;len<=maxWindow&&i+len<=fragments.length;len++){
   const group=fragments.slice(i,i+len);
   const start=group[0].startSec,end=group.at(-1).endSec;
   if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end-start>12)continue;
   const observed=group.map(f=>f.text).join(' ').trim();
   if(!observed)continue;
   const sim=charSimilarity(line,observed);
   candidates.push({
    sourceId:source.id,heardByAsr:observed,startSec:Number(start.toFixed(3)),
    endSec:Number(end.toFixed(3)),
    timing:group.every(f=>f.timing==='word')?'word':'segment',
    tokenSegmentConflict:group.some(f=>f.transcriptConflict===true),
    similarity:sim,exactNormalizedMatch:normalize(line)===normalize(observed),
   });
  }
 }
 return candidates.sort((a,b)=>b.similarity-a.similarity||
  Number(b.exactNormalizedMatch)-Number(a.exactNormalizedMatch)||
  a.startSec-b.startSec).slice(0,2);
}
export function buildAsrRecoveryReport(brief,sources){
 if(!Array.isArray(brief?.script)||brief.script.length<1||brief.script.length>30||
  !Array.isArray(sources)||sources.length>100)
  fail('Expected 1–30 script beats and bounded local Whisper sources');
 const sourceIds=new Set();
 for(const source of sources){
  if(!saneId(source?.id)||sourceIds.has(source.id)||
   !Array.isArray(source.segments)||source.segments.length>500||
   (source.parseError!==null&&source.parseError!==undefined&&typeof source.parseError!=='string'))
   fail('Invalid ASR source metadata');
  sourceIds.add(source.id);
 }
 const beats=brief.script.map((beat,i)=>{
  if(typeof beat?.line!=='string'||beat.line.trim().length<2||beat.line.length>800)
   fail('Invalid script line '+(i+1));
  const windows=sources.flatMap(source=>bestWindows(beat.line,source))
   .sort((a,b)=>b.similarity-a.similarity||
    Number(b.exactNormalizedMatch)-Number(a.exactNormalizedMatch))
   .slice(0,3).map(w=>({
    ...w,diff:wordDifferences(beat.line,w.heardByAsr),
    source:'actual_whisper_json',
   }));
  const best=windows[0];
  const diagnosticStatus=!best?'NO_USABLE_ASR_TEXT':
   best.tokenSegmentConflict?'ASR_TOKEN_SEGMENT_CONFLICT_NEEDS_LISTENING':
   best.exactNormalizedMatch?'ASR_TEXT_MATCHES_SCRIPT_UNVERIFIED':
    best.similarity>=0.78?'ASR_NEAR_MISS_NEEDS_LISTENING':
    'ASR_TEXT_DISAGREES_WITH_SCRIPT';
  return {beat:i+1,expectedLine:beat.line,diagnosticStatus,
   reportedCandidates:windows,automaticallyAccepted:false,
   recommendation:diagnosticStatus==='NO_USABLE_ASR_TEXT'?
    'No usable ASR segment: inspect the recorded audio and Whisper output; make a new take if necessary.':
    diagnosticStatus==='ASR_TEXT_MATCHES_SCRIPT_UNVERIFIED'?
    'ASR text matches, but timing or source quality may still block selection. Verify actual audio and segment boundaries.':
    'Compare the original sound with the script. If the voice said something different, record a correct take. If Whisper alone was wrong, use explicit Recovery Review with verified original audio, SHA and time bounds.'};
 });
 return {version:1,kind:'persona-asr-recovery-diagnostics-v1',
  status:'NEEDS_HUMAN_TRANSCRIPT_REVIEW',beats,
  sourceFiles:sources.map(source=>({sourceId:source.id,
   hasUsableTranscript:source.segments.length>0,parseError:source.parseError??null})),
  publicationApproved:false,renderAllowed:false,automaticallyAccepted:false,
  limits:'Transcript is an ASR hypothesis, not proof of actual spoken words; character similarity is diagnostic only and NEVER changes strict matching thresholds.'};
}
export async function createAsrRecoveryReport({analysisPath,briefPath,outputDir}={}){
 if(![analysisPath,briefPath,outputDir].every(s=>typeof s==='string'&&s.trim()))
  fail('Existing analysis, production brief and output directory required');
 const analysisFile=resolve(analysisPath),briefFile=resolve(briefPath),base=dirname(analysisFile);
 const [analysisRaw,briefRaw]=await Promise.all([
  readFile(analysisFile,'utf8'),readFile(briefFile,'utf8')]);
 const analysis=JSON.parse(analysisRaw),brief=JSON.parse(briefRaw);
 if(analysis?.kind!=='persona-evidence-v1'||!Array.isArray(analysis.sources)||
  analysis.sources.length>100)fail('Invalid local media evidence');
 const root=await realpath(base),sources=[];
 for(const source of analysis.sources){
  if(!saneId(source?.id)||typeof source.durationSec!=='number'||
   !Number.isFinite(source.durationSec)||source.durationSec<=0||source.durationSec>180)
   fail('Invalid source id or measured duration');
  const transcriptPath=join(base,source.id+'-whisper.json');
  let segments=[],parseError=null;
  try{
   const metadata=await lstat(transcriptPath);
   if(!metadata.isFile()||metadata.isSymbolicLink()||metadata.size>8*1024*1024)
    fail('Untrusted Whisper transcript file');
   const path=await realpath(transcriptPath);
   if(!inside(root,path))fail('Whisper transcript escapes selected evidence directory');
   segments=parseWhisperJson(JSON.parse(await readFile(path,'utf8')),source.durationSec);
  }catch(e){
   // Record the actual missing/failed output; never fabricate speech.
   parseError=e?.code==='ENOENT'?'WHISPER_FILE_MISSING':
    String(e?.message??e).slice(0,250);
  }
  sources.push({id:source.id,segments,parseError});
 }
 const report=buildAsrRecoveryReport(brief,sources);
 report.analysisSha256=createHash('sha256').update(analysisRaw).digest('hex');
 report.briefSha256=createHash('sha256').update(briefRaw).digest('hex');
 const lines=[
  '# Persona · диагностика нераспознанных реплик','',
  '**Ни одна реплика этим отчётом не утверждена. MP4 не создавался.**','',
  'Whisper может ошибаться; ближайший текст — только подсказка для прослушивания исходника.','',
 ];
 for(const beat of report.beats){
  lines.push('## Сцена '+beat.beat+' · '+beat.diagnosticStatus,'',
   'По сценарию: '+beat.expectedLine,'');
  for(const c of beat.reportedCandidates){
   lines.push('Whisper ['+c.sourceId+'] '+c.startSec+'–'+c.endSec+' с: '+c.heardByAsr,
    'Похожесть текста (не уверенность в речи): '+c.similarity+
    '; границы: '+c.timing,'');
   if(c.tokenSegmentConflict)
    lines.push('Внимание: текст сегмента и его токены Whisper ПРОТИВОРЕЧАТ друг другу; автоматический выбор запрещён.','');
   if(c.diff.alignment==='position-only'&&c.diff.differingPositions.length){
    for(const change of c.diff.differingPositions)
     lines.push('  Слово '+change.position+': ожидалось «'+change.expected+
      '», Whisper сообщил «'+change.asrReported+'»');
   }
  }
  lines.push('',beat.recommendation,'');
 }
 if(report.sourceFiles.some(s=>s.parseError))
  lines.push('## Ошибки источников','',
   ...report.sourceFiles.filter(s=>s.parseError).map(s=>s.sourceId+': '+s.parseError),'');
 lines.push('Протокол не смягчает ASR-проверку. Для ручного восстановления используй существующий Recovery Review с просмотром исходного видео, проверкой реально слышимой речи, SHA и таймкодов.','');
 const dir=resolve(outputDir),jsonPath=join(dir,'ASR-DIAGNOSTICS.json'),
  markdownPath=join(dir,'ASR-DIAGNOSTICS.md');
 await writeFile(jsonPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
 await writeFile(markdownPath,lines.join('\n'),{flag:'wx'});
 return {jsonPath,markdownPath,reportedBeats:report.beats.length,
  nearMissBeats:report.beats.filter(b=>b.diagnosticStatus==='ASR_NEAR_MISS_NEEDS_LISTENING').length,
  status:report.status};
}
