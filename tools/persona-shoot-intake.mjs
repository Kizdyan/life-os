#!/usr/bin/env node
/**
 * Explicit, offline intake for A01/B01 self-recorded takes.
 * Reuses Persona's existing evidence, SHA-256, video and audio QA.
 * Never scans directories, uploads media, modifies originals or publishes.
 *
 * node tools/persona-shoot-intake.mjs <new-output-dir> A01=<video> B01=<video> [A01=<video> ...]
 */
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './persona-semantic-montage.mjs';

const briefPath=resolve(dirname(fileURLToPath(import.meta.url)),'../docs/persona-two-line-live-asr-check-2026-10-29.json');
const fail=m=>{throw Error(m)};
const allowedExtensions=/\.(?:mp4|mov|mkv|webm|m4v)$/i;
const fullBriefPath=resolve(dirname(fileURLToPath(import.meta.url)),'../docs/persona-delivery/editorial-candidate-production-brief.json');
const sceneOrder=['A01','B01','A02','B02','A03','B03','A04'];

/** Lists only direct files from an author-selected folder; it never searches elsewhere. */
export async function buildFolderShootManifest(folderPath){
 if(typeof folderPath!=='string'||!folderPath.trim())fail('Select one folder containing the recorded takes');
 const root=await realpath(resolve(folderPath));
 const directory=await stat(root);if(!directory.isDirectory())fail('Selected path is not a folder');
 const entries=await readdir(root,{withFileTypes:true});
 const files=[];
 for(const entry of entries){
  if(!entry.isFile()||!allowedExtensions.test(entry.name))continue;
  const path=await realpath(join(root,entry.name));
  if(relative(root,path).startsWith('..'))fail('Selected source is outside the chosen folder');
  files.push({name:entry.name,path});
 }
 if(!files.length)fail('The selected folder contains no supported video files');
 const named=files.map(file=>({...file,scene:/^(A0[1-4]|B0[1-3])(?:[_-]|$)/i.exec(file.name)?.[1]?.toUpperCase()}));
 const unknown=named.filter(file=>!file.scene);
 if(!unknown.length){
  const counts=new Map();const sources=[];
  for(const scene of sceneOrder){for(const file of named.filter(item=>item.scene===scene)){
   const number=(counts.get(scene)??0)+1;counts.set(scene,number);sources.push({id:`${scene}_take${String(number).padStart(2,'0')}`,path:file.path});
  }}
  if(sceneOrder.every(scene=>counts.has(scene)))return {mode:'seven_named_takes',root,manifest:{version:1,sources},notes:['Сопоставление основано только на именах файлов A01…A04/B01…B03. Проверьте реальные реплики перед монтажом.']};
  fail(`Named takes are incomplete; missing ${sceneOrder.filter(scene=>!counts.has(scene)).join(', ')}`);
 }
 if(files.length===2){
  const actor=files.find(file=>/(?:^|[_-])(?:actor|актер|актёр)(?:[_-]|$)/iu.test(file.name));
  const composer=files.find(file=>/(?:^|[_-])(?:composer|композитор)(?:[_-]|$)/iu.test(file.name));
  if(actor&&composer&&actor.path!==composer.path)return {mode:'role_long_takes_needs_review',root,manifest:{version:1,sources:[{id:'actor_take01',path:actor.path},{id:'composer_take01',path:composer.path}]},notes:['Два длинных файла распознаны только по явным именам ролей. Persona выполнит техническую проверку и ASR, но границы семи сцен требуют ручного Review, а не угадываются.']};
 }
 fail('Cannot safely map selected videos. Name seven takes A01…A04/B01…B03, or exactly two files with actor and composer in their names.');
}

export function parseShootInputs(labeledFiles){
 if(!Array.isArray(labeledFiles)||labeledFiles.length<2||labeledFiles.length>12)
  fail('Select 2-12 explicit take files, at least one A01 and one B01');
 const counts={A01:0,B01:0},seen=new Set(),sources=[];
 for(const input of labeledFiles){
  if(typeof input!=='string')fail('Expected A01=<path> or B01=<path>');
  const match=/^(A01|B01)=(.+)$/i.exec(input);
  if(!match||!match[2].trim())fail('Expected A01=<video path> or B01=<video path>');
  const beat=match[1].toUpperCase(),path=resolve(match[2].trim());
  if(!allowedExtensions.test(path))fail('Only video source files are accepted');
  const key=process.platform==='win32'?path.toLowerCase():path;
  if(seen.has(key))fail('A video must not be assigned twice');
  seen.add(key);
  if(++counts[beat]>6)fail('At most six takes per scene');
  sources.push({id:beat+'_take'+String(counts[beat]).padStart(2,'0'),path});
 }
 if(!counts.A01||!counts.B01)fail('At least one A01 and one B01 required');
 return {version:1,sources};
}
export function createIntakeReport(analysis,manifestPath){
 if(analysis?.kind!=='persona-evidence-v1'||!Array.isArray(analysis.sources))
  fail('Unexpected Persona evidence report');
 const takes=analysis.sources.map(source=>{
  const warnings=[...(source.technicalQuality?.warnings??[])];
  if(!source.hasAudio)warnings.push('cannot_transcribe_without_audio');
  if(source.width>source.height)warnings.push('coded_orientation_review_phone_rotation_possible');
  if(source.durationSec<2)warnings.push('short_take_review');
  if(source.hasAudio&&source.technicalQuality?.audioPeakDb===null)warnings.push('audio_peak_unavailable_review');
  return {id:source.id,sourceFile:source.path,bytes:source.bytes,sha256:source.sha256,
   durationSec:source.durationSec,width:source.width,height:source.height,hasAudio:source.hasAudio,
   audioPeakDb:source.technicalQuality?.audioPeakDb??null,
   meanLuma:source.technicalQuality?.meanLuma??null,
   blackIntervals:source.technicalQuality?.blackIntervals??[],
   previewFrames:source.frames??[],warnings,
   assessment:warnings.length?'technical_warnings_require_review':'basic_technical_signals_ok_not_creative_approval'};
 });
 return {version:1,kind:'persona-shoot-intake-v1',status:'needs-human-review',sourceManifest:manifestPath,
  briefPath,sourceCount:takes.length,takes,
  notes:[
   'Local-only technical preflight. No cloud upload, ASR, editing or publication.',
   'Audio peaks are not speech intelligibility or loudness; video luma is not accurate skin color or focus.',
   'Preview frames require personal review for framing, eyes, glasses, skin, acting and expression.',
   'Before montage verify expected spoken lines and scene labels; technical warnings never imply automatic author approval.'
  ],
  next:'Run media:first-reel:draft with sourceManifest, briefPath, new draft directory, installed whisper-cli.exe and multilingual model.'};
}
const warningLabels={
 audio_track_missing:'Нет аудиодорожки',
 cannot_transcribe_without_audio:'Нельзя распознать речь без аудио',
 audio_silent_track_review:'Цифровая тишина на аудиодорожке',
 audio_very_low_peak_review:'Очень тихий звук — проверьте микрофон',
 audio_near_digital_ceiling:'Пик почти у цифрового потолка — проверьте перегрузку',
 audio_peak_unavailable_review:'Пик звука не измерен — проверьте вручную',
 black_video_intervals:'Обнаружены чёрные участки видео',
 low_average_luma_review:'Видео в среднем тёмное — проверьте экспозицию',
 high_average_luma_review:'Видео в среднем светлое — проверьте пересвет',
 coded_orientation_review_phone_rotation_possible:'Горизонтальное кодирование — проверьте поворот телефона',
 short_take_review:'Очень короткий дубль — проверьте конец реплики'
};
export function formatIntakeMarkdown(report){
 if(report?.kind!=='persona-shoot-intake-v1'||!Array.isArray(report.takes))fail('Invalid intake summary');
 const lines=[
  '# Persona · приёмка съёмки A01/B01','',
  '**Статус: требуется просмотр автором.** Ничего не утверждено и не опубликовано.','',
  '| Дубль | Длина | Звук | На что обратить внимание |',
  '| --- | ---: | --- | --- |'
 ];
 for(const take of report.takes){
  const hints=take.warnings.map(x=>warningLabels[x]||x).join('; ')||'Нет предупреждений по базовым техническим сигналам';
  lines.push('| '+take.id+' | '+take.durationSec.toFixed(1)+' с | '+(take.hasAudio?'есть':'нет')+' | '+hints.replaceAll('|','/')+' |');
 }
 lines.push('','## Что проверить лично',
  '1. Слышны ли полностью обе реплики A01 и B01, нет ли обрезанных слов?',
  '2. Глаза в фокусе? Нет бликов на очках, смазанного лица, обрезанных рук?',
  '3. Естественный цвет кожи и одинаковое освещение в обеих ролях?',
  '4. Убедительны ли паузы, интонация и актерская реакция?',
  '5. Посмотрите JPEG в папке evidence и воспроизведите оригиналы.',
  '',
  'Отсутствие замечаний не доказывает художественную готовность к публикации.',
  'Всё локально, исходники не меняются. Вход для монтажа — sources.json.',
  '');
 return lines.join(String.fromCharCode(10));
}
export async function runShootIntake({outputDir,labeledFiles}={}){
 if(typeof outputDir!=='string'||!outputDir.trim())fail('Provide a new output directory');
 const manifest=parseShootInputs(labeledFiles);
 const resolvedInputs=new Set();
 for(const source of manifest.sources){
  const canonical=await realpath(source.path);
  const file=await stat(canonical);
  if(!file.isFile()||file.size<=0)fail('Empty or invalid selected video: '+source.id);
  const key=process.platform==='win32'?canonical.toLowerCase():canonical;
  if(resolvedInputs.has(key))fail('The same source file was assigned to two takes');
  resolvedInputs.add(key);
 }
 const root=resolve(outputDir);
 await mkdir(root,{recursive:false}); // Refuse existing output; never replace original.
 const manifestPath=join(root,'sources.json');
 try{
  await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  const result=await analyze(manifestPath,join(root,'evidence'));
  const analysis=JSON.parse(await readFile(result.analysis,'utf8'));
  const report=createIntakeReport(analysis,manifestPath);
  const reportPath=join(root,'INTAKE.json');
  await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const summaryPath=join(root,'INTAKE.md');
  await writeFile(summaryPath,formatIntakeMarkdown(report),{flag:'wx'});
  return {status:report.status,reportPath,summaryPath,manifestPath,evidencePath:result.analysis,sourceCount:report.sourceCount,
   warningCount:report.takes.reduce((n,t)=>n+t.warnings.length,0)};
 }catch(error){
  await writeFile(join(root,'FAILED.json'),JSON.stringify({
   status:'failed',error:String(error.message||error),
   note:'No input video was modified. Partial technical evidence stays local.'
  },null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw error;
 }
}
export async function runFolderShootIntake({outputDir,folderPath}={}){
 if(typeof outputDir!=='string'||!outputDir.trim())fail('Provide a new output directory');
 const selected=await buildFolderShootManifest(folderPath);
 const root=resolve(outputDir);await mkdir(root,{recursive:false});
 const manifestPath=join(root,'sources.json');
 try{
  await writeFile(manifestPath,JSON.stringify(selected.manifest,null,2)+'\n',{flag:'wx'});
  const result=await analyze(manifestPath,join(root,'evidence'));
  const analysis=JSON.parse(await readFile(result.analysis,'utf8'));
  const report={...createIntakeReport(analysis,manifestPath),briefPath:fullBriefPath,folderMode:selected.mode,mappingNotes:selected.notes};
  const reportPath=join(root,'INTAKE.json');await writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  const summaryPath=join(root,'INTAKE.md');await writeFile(summaryPath,formatIntakeMarkdown(report)+'\n\n## Сопоставление\n'+selected.notes.map(note=>'- '+note).join('\n')+'\n',{flag:'wx'});
  return {status:report.status,reportPath,summaryPath,manifestPath,evidencePath:result.analysis,sourceCount:report.sourceCount,folderMode:selected.mode,warningCount:report.takes.reduce((n,t)=>n+t.warnings.length,0)};
 }catch(error){
  await writeFile(join(root,'FAILED.json'),JSON.stringify({status:'failed',error:String(error.message||error),note:'No input video was modified. Partial technical evidence stays local.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [mode,outputDir,...rest]=process.argv.slice(2);
 const run=mode==='folder'?runFolderShootIntake({outputDir,folderPath:rest[0]}):runShootIntake({outputDir:mode,labeledFiles:[outputDir,...rest].filter(Boolean)});
 run.then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{
  console.error('Persona shoot intake:',e.message);process.exitCode=1;
 });
}
