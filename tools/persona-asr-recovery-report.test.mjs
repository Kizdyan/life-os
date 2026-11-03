import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildAsrRecoveryReport,createAsrRecoveryReport} from './persona-asr-recovery-report.mjs';

const brief={version:1,sourceFormat:'reel',script:[
 {order:1,line:'Я актёр. И ещё пишу музыку.'},
 {order:2,line:'Это колыбельная.'},
]};
const segments=[{text:'Эта',startSec:.2,endSec:.6,timing:'word'},
 {text:'колыбельная.',startSec:.6,endSec:1.8,timing:'word'}];
test('B04 near-miss identifies the actual ASR word but NEVER approves a cut',()=>{
 const report=buildAsrRecoveryReport(brief,[{
  id:'B04_take01',segments,parseError:null,
 }]);
 assert.equal(report.status,'NEEDS_HUMAN_TRANSCRIPT_REVIEW');
 assert.equal(report.renderAllowed,false);
 assert.equal(report.publicationApproved,false);
 assert.equal(report.beats[0].diagnosticStatus,'ASR_TEXT_DISAGREES_WITH_SCRIPT');
 assert.equal(report.beats[1].diagnosticStatus,'ASR_NEAR_MISS_NEEDS_LISTENING');
 assert.equal(report.beats[1].reportedCandidates[0].sourceId,'B04_take01');
 assert.equal(report.beats[1].reportedCandidates[0].heardByAsr,'Эта колыбельная.');
 assert.equal(report.beats[1].reportedCandidates[0].diff.alignment,'position-only');
 assert.deepEqual(report.beats[1].reportedCandidates[0].diff.differingPositions,[{
  position:1,expected:'это',asrReported:'эта',
 }]);
 assert.equal(report.beats[1].automaticallyAccepted,false);
});
test('exact ASR text is still UNVERIFIED speech and never a render authorization',()=>{
 const report=buildAsrRecoveryReport(brief,[{
  id:'B04_take01',parseError:null,segments:[{
   text:'Это колыбельная.',startSec:.2,endSec:1.8,timing:'segment',
  }],
 }]);
 assert.equal(report.beats[1].diagnosticStatus,'ASR_TEXT_MATCHES_SCRIPT_UNVERIFIED');
 assert.equal(report.beats[1].automaticallyAccepted,false);
 assert.equal(report.renderAllowed,false);
});
test('missing transcripts never become invented words',()=>{
 const report=buildAsrRecoveryReport(brief,[{
  id:'B04_take01',segments:[],parseError:'WHISPER_FILE_MISSING',
 }]);
 assert.ok(report.beats.every(b=>b.diagnosticStatus==='NO_USABLE_ASR_TEXT'));
 assert.equal(report.sourceFiles[0].hasUsableTranscript,false);
 assert.equal(report.sourceFiles[0].parseError,'WHISPER_FILE_MISSING');
});
test('real source Whisper JSON creates a diagnosis file with preserved evidence hashes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-asr-diagnose-'));
 try{
  const evidence=join(root,'evidence');await mkdir(evidence);
  const analysis=join(evidence,'analysis.json'),briefPath=join(root,'brief.json');
  const file=join(evidence,'B04_take01-whisper.json');
  await writeFile(analysis,JSON.stringify({version:1,kind:'persona-evidence-v1',
   sources:[{id:'B04_take01',durationSec:3,hasAudio:true}]}));
  await writeFile(briefPath,JSON.stringify(brief));
  await writeFile(file,JSON.stringify({transcription:[{
   text:' Эта колыбельная.',offsets:{from:200,to:1800},
   tokens:[{text:' Эта',offsets:{from:200,to:600}},
    {text:' колыбельная.',offsets:{from:600,to:1800}}],
  }]}));
  const result=await createAsrRecoveryReport({analysisPath:analysis,
   briefPath,outputDir:root});
  assert.equal(result.nearMissBeats,1);
  const report=JSON.parse(await readFile(result.jsonPath,'utf8'));
  assert.match(report.analysisSha256,/^[a-f0-9]{64}$/);
  assert.match(report.briefSha256,/^[a-f0-9]{64}$/);
  assert.equal(report.beats[1].reportedCandidates[0].heardByAsr,'Эта колыбельная.');
  assert.equal(report.beats[1].reportedCandidates[0].timing,'word');
  assert.equal(report.publicationApproved,false);
  const markdown=await readFile(result.markdownPath,'utf8');
  assert.match(markdown,/ожидалось «это», Whisper сообщил «эта»/);
  assert.match(markdown,/Ни одна реплика этим отчётом не утверждена/);
  await assert.rejects(createAsrRecoveryReport({analysisPath:analysis,
   briefPath,outputDir:root}),/EEXIST/);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('Whisper path injection is rejected without reading arbitrary files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'persona-asr-safety-'));
 try{
  const evidence=join(root,'evidence');await mkdir(evidence);
  const analysis=join(evidence,'analysis.json'),briefPath=join(root,'brief.json');
  await writeFile(analysis,JSON.stringify({kind:'persona-evidence-v1',
   sources:[{id:'../../outside',durationSec:2}]}));
  await writeFile(briefPath,JSON.stringify(brief));
  await assert.rejects(createAsrRecoveryReport({
   analysisPath:analysis,briefPath,outputDir:root,
  }),/Invalid source id/);
  await assert.rejects(stat(join(root,'ASR-DIAGNOSTICS.json')),/ENOENT/);
 }finally{await rm(root,{recursive:true,force:true})}
});
