/** Client-only import of opt-in local Ollama Persona script.
 * Does not send anything over network or claim provider attestation.
 */
export interface ImportedPersonaDraft {
 title:string;caption:string;slides:{eyebrow:string;title:string;body:string}[];
 platformNotes:{instagram:string;vk:string;youtube:string};
 style:'documentary';assetInstruction:string;
}
function obj(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('Недопустимый JSON-объект сценария.');
 return x as Record<string,unknown>;
}
function str(x:unknown,name:string,max=2500):string{
 if(typeof x!=='string'||!x.trim()||x.length>max)
  throw Error('Некорректное поле сценария: '+name);
 return x.trim();
}
function timecode(sec:number){return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')}
export function readImportedPersonaJson(raw:string):{draft:ImportedPersonaDraft;model:string;sceneCount:number}{
 if(new TextEncoder().encode(raw).length>262144)throw Error('Файл сценария превышает 256 КБ.');
 let value:unknown;
 try{value=JSON.parse(raw)}catch{throw Error('Файл не является корректным JSON.')}
 const root=obj(value);
 if(root.kind!=='persona-local-ai-result'||root.version!==1||
  root.source!=='real-local-ollama-completion'||root.status!=='STRUCTURE_PASS')
  throw Error('Файл не является подтверждённым по формату экспортом локального Persona AI.');
 const model=str(root.model,'model',120);
 const original=obj(root.draft),scenes=original.scenes;
 if(!Array.isArray(scenes)||scenes.length<4||scenes.length>10)
  throw Error('Требуется от 4 до 10 покадровых сцен.');
 const runtime=original.runtimeSec;
 if(!Number.isInteger(runtime)||(runtime as number)<30||(runtime as number)>45)
  throw Error('Длительность сценария должна быть от 30 до 45 секунд.');
 const title=str(original.title,'title',250);
 const hook=str(original.hook,'hook',1500);
 const twist=str(original.twist,'twist',1500);
 const note=str(original.productionNotes,'productionNotes',2500);
 const order=str(original.shootingOrder,'shootingOrder',2500);
 const platforms=obj(original.platforms);
 const platformNotes={
  instagram:str(platforms.instagram,'Instagram',1500),
  vk:str(platforms.vk,'VK',1500),
  youtube:str(platforms.youtube,'YouTube',1500),
 };
 let cursor=0;
 const actions=new Set<string>();
 const slides=scenes.map((input,i)=>{
  const s=obj(input);
  const start=s.startSec,end=s.endSec;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start!==cursor||
    (end as number)<=(start as number)||(end as number)>45)
    throw Error('Сцена '+(i+1)+' имеет пересечение или разрыв времени.');
  cursor=end as number;
  const action=str(s.action,'action',1500);
  const dialogue=str(s.dialogue,'dialogue',1500);
  const camera=str(s.camera,'camera',1500);
  const lighting=str(s.lighting,'lighting',1500);
  const sound=str(s.sound,'sound',1500);
  const edit=str(s.edit,'edit',1500);
  if([action,dialogue,camera,lighting,sound,edit].some(x=>x.length<8))
   throw Error('Сцена '+(i+1)+' недостаточно конкретна.');
  actions.add(action.toLocaleLowerCase('ru'));
  return {
   eyebrow:'КАДР '+(i+1)+' · '+timecode(start as number)+'–'+timecode(end as number),
   title:action,
   body:'Реплика: '+dialogue+'\nКамера: '+camera+'\nСвет: '+lighting+
    '\nЗвук: '+sound+'\nМонтаж: '+edit,
  };
 });
 if(cursor!==runtime)throw Error('Сцены не покрывают заявленную длительность.');
 if(actions.size<Math.ceil(scenes.length*0.75))
  throw Error('Слишком много повторяющихся действий.');
 return {model,sceneCount:slides.length,draft:{
  title,slides,caption:typeof original.caption==='string'?original.caption.slice(0,2500):title,
  platformNotes,style:'documentary',
  assetInstruction:'ХУК: '+hook+'\nФИНАЛ: '+twist+'\nПОРЯДОК СЪЁМКИ: '+order+
   '\nПРОИЗВОДСТВЕННЫЕ ПРИМЕЧАНИЯ: '+note,
 }};
}
