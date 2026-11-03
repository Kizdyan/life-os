#!/usr/bin/env node
/**
 * One-command offline comparison review. Never overwrites original media or prior
 * reports. Output stays beside the selected private-media comparison package.
 */
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {basename,dirname,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectPersonaComparisonPackage} from './persona-comparison-quality.mjs';

const fail=message=>{throw Error('Persona review package: '+message)};
const esc=value=>String(value).replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const number=(value,places=2)=>Number.isFinite(value)?Number(value).toFixed(places):'—';
const presetIds=['natural-clean','warm-cinematic','muted-filmic'];
function frameUrl(root,folder,file){
 if(typeof file!=='string'||basename(file)!==file||
  !/^pair-[0-9]{2}-(natural-clean|warm-cinematic|muted-filmic)\.jpg$/.test(file))
  fail('unexpected evidence filename');
 const local=relative(resolve(root),join(resolve(folder),file));
 if(!local||local==='..'||local.startsWith('..'+sep)||local.startsWith(sep))
  fail('evidence filename escapes the review folder');
 return local.split(sep).map(encodeURIComponent).join('/');
}
export function renderPersonaReviewHtml(report,reviewDir){
 if(!report||report.kind!=='persona-comparison-quality-v1'||report.version!==1||
  report.publicationApproved!==false||report.artisticStatus!=='awaiting-author-review'||
  !Array.isArray(report.variants)||report.variants.length!==3||
  !Array.isArray(report.visualEvidence?.frames))fail('unexpected QC report');
 const summaries=report.variants.map((variant,index)=>{
  if(variant?.id!==presetIds[index])fail('unknown QC variant');
  const temporal=variant.temporalFlicker?.status==='measured'
   ?'Проба 12 кадр/с: выполнена, подозрительных интервалов '+(variant.temporalFlicker.candidates?.length??0)
   :'Проба 12 кадр/с: нет данных (не доказывает отсутствие фликера)';
  const events=[...(variant.temporalFlicker?.candidates??[]),...(variant.additionalSampledJumps??[])]
   .map(item=>item.atSec).filter(Number.isFinite).slice(0,10).map(x=>number(x,3)+' с');
  return '<article><h3>'+esc(variant.id)+'</h3>'+
   '<p>Техническая проверка: <strong>'+esc(variant.technicalStatus?.toUpperCase()??'?')+
   '</strong>; художественная приёмка не выполнена.</p>'+
   '<p>'+esc(temporal)+'</p><p>Моменты для просмотра: '+esc(events.length?events.join(', '):'не выделены')+'</p>'+
   '<p>Средняя разность яркости: '+esc(number(variant.statistics?.meanLumaChange))+
   ' (8-bit YUV, не показатель художественного качества).</p></article>';
 }).join('\n');
 const frames=report.visualEvidence.frames.map((frame,index)=>{
  const pictures=frame.pairs.map(pair=>{
   if(!presetIds.includes(pair.variantId))fail('unknown frame variant');
   const url=frameUrl(reviewDir,report.visualEvidence.directory,pair.filename);
   return '<figure><a href="'+esc(url)+'"><img loading="lazy" src="'+esc(url)+
    '" alt="Слева оригинал, справа '+esc(pair.variantId)+'; '+esc(frame.timecode)+'"></a>'+
    '<figcaption>'+esc(pair.variantId)+'</figcaption></figure>';
  }).join('\n');
  return '<section><h3>Кадр '+(index+1)+' · '+esc(frame.timecode)+
   '</h3><div class="pictures">'+pictures+'</div></section>';
 }).join('\n');
 return [
  '<!doctype html><html lang="ru"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src \'self\' file:; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">',
  '<title>Persona — локальная проверка цвета</title>',
  '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:1100px;margin:auto;padding:20px;background:#181c22;color:#f2f4f8}',
  'header,article,section{border:1px solid #424a56;border-radius:12px;background:#252a33;padding:15px;margin:12px 0}',
  '.pictures{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:12px}',
  'figure{margin:0}img{max-width:100%;border-radius:8px}a{color:#b8d8ff}p{overflow-wrap:anywhere}</style></head><body>',
  '<header><h1>Persona · Video Quality Lab</h1>',
  '<p><strong>Технический QC: '+esc(report.technicalStatus?.toUpperCase()??'UNKNOWN')+
   ' · Художественная приёмка: ОЖИДАЕТ АВТОРА · Публикация: ЗАПРЕЩЕНА</strong></p>',
  '<p>Источник: '+esc(report.original?.fileName??'неизвестен')+' · SHA-256: '+esc(report.sourceSha256??'')+'</p>',
  '<p>Разрешение: '+esc(report.original?.width??'?')+' × '+esc(report.original?.height??'?')+
   ' · '+esc(number(report.original?.fps))+' fps · '+esc(number(report.original?.durationSec))+' с.</p>',
  '<p>Этот HTML работает локально и не загружает медиа в облако.</p></header>',
  '<h2>Техническая сводка</h2>',summaries,
  '<h2>Парные кадры · оригинал слева, обработка справа</h2>',frames,
  '<p>JPEG и 12 кадров/с не заменяют просмотр MP4 в движении. Проверьте лицо, кожу, очки, свет, шум, детали и звук в Comparison Studio. Цветовой выбор не разрешает публикацию.</p>',
  '</body></html>'
 ].join('\n');
}
export async function createPersonaReviewPackage({comparisonDir,ffmpegDir}={}){
 if(typeof comparisonDir!=='string'||!comparisonDir.trim())fail('comparisonDir required');
 const sourceDir=resolve(comparisonDir);
 const label=basename(sourceDir).replace(/[^a-zA-Z0-9_-]/g,'-').slice(0,45)||'comparison';
 const reviewDir=await mkdtemp(join(dirname(sourceDir),label+'-quality-review-'));
 try{
  const reportPath=join(reviewDir,'QUALITY.json');
  const report=await inspectPersonaComparisonPackage({comparisonDir:sourceDir,outputPath:reportPath,ffmpegDir});
  const htmlPath=join(reviewDir,'REVIEW.html');
  await writeFile(htmlPath,renderPersonaReviewHtml(report,reviewDir),{flag:'wx'});
  await readFile(reportPath,'utf8');
  return {reviewDir,reportPath,htmlPath,technicalStatus:report.technicalStatus,
   artisticStatus:report.artisticStatus,publicationApproved:false};
 }catch(error){
  await rm(reviewDir,{recursive:true,force:true});
  throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [, ,comparisonDir,ffmpegDir]=process.argv;
 if(!comparisonDir){process.stderr.write('Usage: node tools/persona-comparison-review.mjs <comparison-dir> [ffmpeg-dir]\n');process.exitCode=2}
 else createPersonaReviewPackage({comparisonDir,ffmpegDir}).then(result=>{
  process.stdout.write('Review directory: '+result.reviewDir+'\nOpen local HTML: '+result.htmlPath+
   '\nImport QUALITY.json into Comparison Studio after the five original package files.\n'+
   'Technical: '+result.technicalStatus+' | Artistic: pending | Publication: prohibited\n');
 }).catch(error=>{process.stderr.write(String(error.message||error)+'\n');process.exitCode=1});
}
