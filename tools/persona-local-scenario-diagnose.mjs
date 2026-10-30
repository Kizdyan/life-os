/** Offline, no-model forensic inspection of existing local Ollama raw responses.
 * Does not create, validate, approve or modify a screenplay/Production Brief.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizePersonaLocalScenarioBeats,PersonaLocalFrameValidationError} from './persona-local-scenario-output.mjs';

export function diagnosePersonaLocalRawResponse(rawResponse){
  if(typeof rawResponse!=='string'||!rawResponse.trim())
    return {status:'REJECTED_INVALID_JSON',message:'Пустой ответ модели',frameCount:null,corrections:[]};
  let payload;
  try{payload=JSON.parse(rawResponse)}
  catch(error){return {status:'REJECTED_INVALID_JSON',message:error instanceof Error?error.message:'Не удалось прочитать JSON',
    frameCount:null,corrections:[]}}
  const frameCount=Array.isArray(payload?.beats)?payload.beats.length:null;
  try{
    const normalized=normalizePersonaLocalScenarioBeats(payload?.beats);
    return {status:normalized.corrections.length?'FRAME_METADATA_NORMALIZED':'FRAME_METADATA_CANONICAL',
      frameCount,corrections:normalized.corrections,
      warning:'Проверены только framing и durationSec. Остальные поля, драматургия и актёрское качество НЕ валидированы, сюжет не изменён.'};
  }catch(error){
    return {status:'REJECTED_FRAME_METADATA',frameCount,
      message:error instanceof Error?error.message:'Неизвестная ошибка',
      diagnostic:error instanceof PersonaLocalFrameValidationError?error.diagnostic:null,
      corrections:[],
      warning:'Исходный raw-файл не менялся. Для исправления отсутствующего поля требуется новая генерация или явная авторская редактура.'};
  }
}
export async function diagnosePersonaLocalRawFile(rawPath,{outPath}={}){
  const bytes=await readFile(resolve(rawPath));
  if(bytes.length>120_000)throw Error('Raw-ответ модели превышает 120 КБ');
  const report=diagnosePersonaLocalRawResponse(bytes.toString('utf8'));
  if(outPath){
    if(resolve(outPath)===resolve(rawPath))throw Error('Нельзя перезаписать исходный raw-файл');
    await writeFile(resolve(outPath),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2),outArg=args.indexOf('--out');
  if(args.length===0||args.includes('--help')){
    console.log('Usage: node tools/persona-local-scenario-diagnose.mjs <raw-response.txt> [--out new-validation-report.json]');
  }else{
    diagnosePersonaLocalRawFile(args[0],{outPath:outArg>=0?args[outArg+1]:undefined})
      .then(report=>{console.log(JSON.stringify(report,null,2));if(report.status.startsWith('REJECTED'))process.exitCode=1;},
        error=>{console.error('Не удалось изучить локальный raw-ответ: '+error.message);process.exitCode=1});
  }
}
