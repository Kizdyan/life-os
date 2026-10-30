/** Safe offline conversion of a saved Persona scenario/project JSON to a local-only Doctor task. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {validateDoctorTask} from './persona-local-script-doctor.mjs';

function parseHumanIndices(input,label){
 if(typeof input!=='string'||!/^\s*\d+(?:\s*,\s*\d+)*\s*$/.test(input))throw Error(`${label}: укажите номера кадров от 1 через запятую`);
 return input.split(',').map(x=>Number(x.trim())-1);
}
function extractScript(payload,projectId){
 if(payload?.currentRevision&&payload?.currentRevisionId)return payload;
 if(payload?.scenarioWorkspace?.script)return payload.scenarioWorkspace.script;
 if(payload?.version===1&&typeof payload.ideaId==='string'&&Array.isArray(payload.script)){
  const revisionId='local-brief:'+payload.ideaId;
  return {idea:{id:payload.ideaId,title:payload.sourceTitle,originalConflict:payload.sourceAngle},currentRevisionId:revisionId,
   currentRevision:{id:revisionId,beats:payload.script.map((beat,index)=>({purpose:index===0?'hook':index===payload.script.length-1?'ending':'development',line:beat?.line,action:beat?.action,durationSec:beat?.durationSec}))}};
 }
 const projects=Array.isArray(payload?.projects)?payload.projects:null;
 if(projects){
  const found=projectId?projects.find(x=>x?.id===projectId):projects.length===1?projects[0]:undefined;
  if(found?.scenarioWorkspace?.script)return found.scenarioWorkspace.script;
  throw Error(projectId?'Не найден проект с указанным ID и сценарным рабочим пространством':'Укажите --project-id для экспорта, содержащего несколько проектов');
 }
 throw Error('Файл не содержит ScenarioScript или PersonaProject.scenarioWorkspace.script');
}
export function buildLocalDoctorTask(payload,options){
 const script=extractScript(payload,options.projectId);
 return validateDoctorTask({kind:'persona-local-doctor-input-v1',version:1,script,
  targetIndices:parseHumanIndices(options.target,'--target'),
  lockedIndices:options.lock?parseHumanIndices(options.lock,'--lock'):[],
  instruction:options.instruction,authorFeedback:options.authorFeedback,
  creativeProfile:options.creativeProfile??null});
}
export async function createLocalDoctorTaskFile(inputFile,outputFile,options){
 const input=resolve(inputFile),output=resolve(outputFile);
 if(input===output)throw Error('Входной и выходной путь совпадают');
 const bytes=await readFile(input);
 if(bytes.length>400_000)throw Error('Файл экспортированного проекта превышает 400 КБ; выберите один сценарий');
 const data=JSON.parse(bytes.toString('utf8'));
 const task=buildLocalDoctorTask(data,options);
 await writeFile(output,JSON.stringify(task,null,2)+'\n',{flag:'wx'});
 return output;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const argv=process.argv.slice(2),flags={};
 for(let i=0;i<argv.length;i+=2){if(argv[i]?.startsWith('--')&&argv[i+1])flags[argv[i].slice(2)]=argv[i+1];}
 if(argv.includes('--help'))console.log('node tools/persona-local-script-doctor-task.mjs --input scenario.json --out doctor-task.json --target 3,4 --lock 1 --instruction "Усиль финал" [--project-id project-1] [--author-feedback "Слишком предсказуемо"]');
 else if(!flags.input||!flags.out||!flags.target||!flags.instruction){console.error('Укажите --input --out --target --instruction; номера кадров начинаются с 1');process.exitCode=2;}
 else createLocalDoctorTaskFile(flags.input,flags.out,{target:flags.target,lock:flags.lock,instruction:flags.instruction,projectId:flags['project-id'],authorFeedback:flags['author-feedback']})
  .then(p=>console.log('Локальное задание создано (без сети): '+p),error=>{console.error(error.message);process.exitCode=1;});
}
