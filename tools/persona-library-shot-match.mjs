#!/usr/bin/env node
/**
 * Production Brief -> REAL indexed local media candidates.
 * Does not claim automatic visual relevance, grant media rights or approve edits.
 * Until the author accepts a segment, a possible B-roll match is not a completed shot.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {searchCatalog,tokenize} from './persona-local-library.mjs';
const fail=m=>{throw Error('Persona library shot match: '+m)};
const stopwords=new Set([
 'для','нужно','надо','когда','чтобы','этот','этого','этой','снимает',
 'кадр','план','реплика','актер','актёр','композитор','музыкант','режиссёр','сцена','герой','ты','всё','это',
 'при','через','на','по','под','про','свет','камера','телефон','движение',
 'перед','потом','после','сейчас','сразу','без','или','вот','как',
]);
function queryForShot(shot,beat){
 const unique=[...new Set(tokenize([shot.action,beat?.action,beat?.line].filter(Boolean).join(' ')))
  .filter(x=>x.length>=4&&!stopwords.has(x))].slice(0,15);
 return unique.join(' ');
}
export function matchBriefToLibrary({brief,catalog,maxMatches=4}={}){
 if(!brief||brief.version!==1||!Array.isArray(brief.shots)||
  !Array.isArray(brief.script)||brief.shots.length!==brief.script.length||
  !brief.shots.length||brief.shots.length>30)fail('Valid canonical brief with matching shots/script required');
 if(!catalog||catalog.kind!=='persona-local-library-v1'||!Array.isArray(catalog.assets))
  fail('Valid local media catalog required');
 if(!Number.isInteger(maxMatches)||maxMatches<1||maxMatches>10)fail('Invalid maxMatches');
 const shots=brief.shots.map((shot,i)=>{
  const beat=brief.script[i];if(shot.order!==i+1||beat.order!==i+1)fail('Shot order mismatch');
  const query=queryForShot(shot,beat);
  const results=query?searchCatalog(catalog,query,{limit:80}):[];
  const uniq=new Set(),candidates=[];
  for(const result of results){
   // Provenance is essential. Filename matches may prompt inspection,
   // but they are NOT proof of the image or the actor's actual performance.
   const key=[result.assetId,result.startSec??'full'].join(':');
   if(uniq.has(key))continue;
   uniq.add(key);
   candidates.push({
    assetId:result.assetId,sourcePath:result.sourcePath,sha256:result.sha256,
    startSec:result.startSec,endSec:result.endSec,matchedTerms:result.matchedTerms,
    evidence:result.source,visionModel:result.model??null,
    confidenceClaim:'candidate_only',
   });
   if(candidates.length>=maxMatches)break;
  }
  return {order:shot.order,requiredLine:beat.line,requiredAction:shot.action,
   searchTerms:query,candidates,
   status:candidates.length?'CANDIDATES_NEED_AUTHOR_REVIEW':'NO_MATCH',
   stillNeedsCaptureOrApproval:true,
   note:'Search matches are not evidence that the scripted line was actually spoken. Check suitability and rights before using.'};
 });
 return {version:1,kind:'persona-brief-local-asset-matches-v1',
  ideaId:brief.ideaId??null,librarySnapshotAt:catalog.generatedAt??null,
  matchedShots:shots.filter(s=>s.candidates.length>0).length,
  totalShots:shots.length,missingOrUnapprovedShots:shots.length,
  shots,publicationApproved:false};
}
export function shootGapMarkdown(plan){
 if(plan?.kind!=='persona-brief-local-asset-matches-v1')fail('Invalid match plan');
 const lines=['# Persona — проверка архивных кадров','',
  'Все найденные фрагменты — кандидаты, не утверждённые дубли. Исходники не изменялись.',
  'Сначала просмотри кандидатов, только потом вычёркивай новые съёмки.',''];
 for(const shot of plan.shots){
  lines.push('## Кадр '+shot.order+' — '+shot.status,
   'Реплика: '+shot.requiredLine,'Действие: '+shot.requiredAction,
   'Поисковые слова: '+(shot.searchTerms||'(нет осмысленных слов)'));
  for(const c of shot.candidates){
   lines.push('','- Файл: '+c.sourcePath,
    '  Время: '+(c.startSec===null?'неизвестно (целый файл)':
     String(c.startSec)+'–'+String(c.endSec)+' сек.'),
    '  Основание: '+c.evidence,
    '  Найдены слова: '+c.matchedTerms.join(', '));
  }
  if(!shot.candidates.length)lines.push('','Нужна новая съёмка или ручной поиск в медиатеке.');
  else lines.push('','Автор должен проверить кадр; наличие файла не заменяет произнесённую реплику.');
  lines.push('');
 }
 return lines.join('\n')+'\n';
}
export async function matchLibraryFiles({briefPath,catalogPath,outputPath}={}){
 if(!briefPath||!catalogPath||!outputPath)fail('Brief, catalog and NEW result output required');
 const brief=JSON.parse(await readFile(resolve(briefPath),'utf8'));
 const catalog=JSON.parse(await readFile(resolve(catalogPath),'utf8'));
 const plan=matchBriefToLibrary({brief,catalog});
 await writeFile(resolve(outputPath),JSON.stringify(plan,null,2)+'\n',{flag:'wx'});
 return {output:resolve(outputPath),matchedShots:plan.matchedShots,totalShots:plan.totalShots,
  status:'CANDIDATES_NEED_AUTHOR_REVIEW'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [briefPath,catalogPath,outputPath]=process.argv.slice(2);
 try{
  const result=await matchLibraryFiles({briefPath,catalogPath,outputPath});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  const plan=JSON.parse(await readFile(result.output,'utf8'));
  const markdown=resolve(outputPath)+'.md';
  await writeFile(markdown,shootGapMarkdown(plan),{flag:'wx'});
  process.stdout.write('Review shooting gaps: '+markdown+'\n');
 }catch(e){process.stderr.write(String(e?.message??e)+'\n');process.exitCode=1}
}
