import {readTakeBindings,type TakeBinding} from '../../../packages/core/src/persona-manual-script.mjs';
export type PersonaAiMediaJob={version:1;projectId:string;createdAt:string;status:'awaiting-author-review';model:string;variation:'cinematic'|'humor'|'intimate'|'unexpected';briefFingerprintSha256:string;briefSnapshot:string;outputPath:string;videoPath:string;qaPath:string;resultPath:string;sourceCount:number;sessionId?:string;masterAsset?:boolean;creativeDirection?:{mode:'auto'|'manual';selected_preset:'Dynamic'|'Cinematic'|'Commercial';model:string|null};subtitlesBurnedIn?:boolean;takeBindings?:TakeBinding[];distributionAllowed:false};
const sha=/^[a-f0-9]{64}$/i;
export function isPersonaDirectorDecisionFresh(value:unknown,nowMs=Date.now()):boolean{
 const decision=value as {createdAt?:unknown}|null;
 if(typeof decision?.createdAt!=='string')return false;
 const age=nowMs-Date.parse(decision.createdAt);return Number.isFinite(age)&&age>=0&&age<30*60*1000;
}
export function planPersonaAiTakeUploads(files:readonly {name:string;size:number}[],assignments:readonly (number|null)[],sceneCount:number,masterAsset=false){
 if(masterAsset?files.length!==1:files.length<2||files.length>12)throw Error(masterAsset?'Выберите один длинный мастер-ассет.':'Выберите от 2 до 12 дублей за один запуск.');
 if(!Number.isInteger(sceneCount)||sceneCount<2||sceneCount>30)throw Error('Нужен утверждённый сценарий со сценами.');
 const counts=new Map<number,number>();let total=0;
 return files.map((file,index)=>{
  const extension=/\.(mp4|mov|mkv|webm|m4v)$/i.exec(file.name)?.[0];
  if(!extension||/[\\/\x00-\x1f:]/.test(file.name)||file.name.length>255)throw Error('Неподдерживаемый формат или имя файла: '+file.name);
  if(!Number.isSafeInteger(file.size)||file.size<1024||file.size>2*1024**3)throw Error('Дубль должен быть от 1 КБ до 2 ГБ: '+file.name);
  total+=file.size;if(total>4*1024**3)throw Error('За один запуск можно передать до 4 ГБ.');
  const sceneOrder=masterAsset?1:assignments[index];
  if(!Number.isInteger(sceneOrder)||sceneOrder!<1||sceneOrder!>sceneCount)throw Error('Укажите сцену для каждого дубля.');
  const take=(counts.get(sceneOrder!)??0)+1;counts.set(sceneOrder!,take);
  return {originalName:file.name,sceneOrder:sceneOrder!,workerName:`S${String(sceneOrder).padStart(2,'0')}_take${String(take).padStart(2,'0')}${extension}`};
 });
}
export function readPersonaAiMediaJob(value:unknown):PersonaAiMediaJob|null{
 const v=value as Partial<PersonaAiMediaJob>;
 if(v?.creativeDirection&&(!['auto','manual'].includes(v.creativeDirection.mode)||!['Dynamic','Cinematic','Commercial'].includes(v.creativeDirection.selected_preset)||(v.creativeDirection.model!==null&&typeof v.creativeDirection.model!=='string')))return null;
 if(!v||typeof v!=='object'||v.version!==1||typeof v.projectId!=='string'||!v.projectId||typeof v.createdAt!=='string'||!Number.isFinite(Date.parse(v.createdAt))||v.status!=='awaiting-author-review'||typeof v.model!=='string'||!v.model||!['cinematic','humor','intimate','unexpected'].includes(String(v.variation))||typeof v.briefFingerprintSha256!=='string'||!sha.test(v.briefFingerprintSha256)||typeof v.briefSnapshot!=='string'||!v.briefSnapshot||v.briefSnapshot.length>100000||typeof v.outputPath!=='string'||!v.outputPath||typeof v.videoPath!=='string'||!v.videoPath||typeof v.qaPath!=='string'||!v.qaPath||typeof v.resultPath!=='string'||!v.resultPath||typeof v.sourceCount!=='number'||!Number.isInteger(v.sourceCount)||v.sourceCount<(v.masterAsset===true?1:2)||v.sourceCount>12||(v.masterAsset!==undefined&&(typeof v.masterAsset!=='boolean'||v.masterAsset&&v.sourceCount!==1))||v.distributionAllowed!==false||(v.subtitlesBurnedIn!==undefined&&typeof v.subtitlesBurnedIn!=='boolean')||(v.sessionId!==undefined&&!/^[a-f0-9-]{36}$/.test(v.sessionId)))return null;
 if(v.takeBindings!==undefined){try{readTakeBindings(JSON.parse(v.briefSnapshot),v.takeBindings,true)}catch{return null}}
 return v as PersonaAiMediaJob;
}


export function inferPersonaSceneOrder(name:string,sceneCount:number):number|null{
 const match=/^(?:S(\d{2})_take\d+|(\d{1,3}))\.(?:mp4|mov|mkv|webm|m4v)$/i.exec(name);
 const order=Number(match?.[1]??match?.[2]);return Number.isInteger(order)&&order>=1&&order<=sceneCount?order:null;
}
export function validatePersonaTakeDuration(duration:number,planned:number,master:boolean){
 const limit=master?900:Math.min(60,Math.max(15,planned*3));
 if(!Number.isFinite(duration)||duration<.25||!Number.isFinite(limit)||duration>limit)throw Error('Длительность дубля должна быть 0,25–'+limit+' с. Для длинного файла выберите режим мастер-ассета.');
 return duration;
}
