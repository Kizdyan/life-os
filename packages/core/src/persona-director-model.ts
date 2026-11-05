import {
 buildPersonaProductionBrief,
 type PersonaProductionBrief,
 type PersonaProductionIdea,
} from './persona-production-brief.js';

export type PersonaDirectorScene={
 durationSec:number;line:string;action:string;
 framing:'close-up'|'medium'|'detail';
 camera:string;lighting:string;performance:string;edit:string;
};
export type PersonaDirectorProposal={
 version:1;kind:'persona-director-proposal-v1';
 executionMode:'ai';model:string;provider:'ollama'|'gateway';
 ideaId:string;createdAt:string;publicationApproved:false;
 title:string;hook:string;
 setup:{location:string;camera:string;lighting:string;sound:string;wardrobe:string;arrangement:string};
 scenes:PersonaDirectorScene[];
 editingIntent:string;colorIntent:string;
};
function obj(value:unknown):value is Record<string,unknown>{
 return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}
function text(value:unknown,min:number,max:number):value is string{
 return typeof value==='string'&&value.trim().length>=min&&value.length<=max;
}
function iso(value:unknown):value is string{
 return typeof value==='string'&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
}
export function readPersonaDirectorProposal(value:unknown,ideaId:string):PersonaDirectorProposal|null{
 if(!obj(value)||value.version!==1||value.kind!=='persona-director-proposal-v1'||
  value.executionMode!=='ai'||!['ollama','gateway'].includes(String(value.provider))||
  !text(value.model,1,120)||!text(value.ideaId,1,128)||value.ideaId!==ideaId||
  !iso(value.createdAt)||value.publicationApproved!==false||
  !text(value.title,4,140)||!text(value.hook,4,180)||
  !obj(value.setup)||!text(value.setup.location,5,500)||
  !text(value.setup.camera,5,500)||!text(value.setup.lighting,5,500)||
  !text(value.setup.sound,5,500)||!text(value.setup.wardrobe,5,500)||
  !text(value.setup.arrangement,5,500)||!text(value.editingIntent,5,600)||
  !text(value.colorIntent,5,600)||
  !Array.isArray(value.scenes)||value.scenes.length<4||value.scenes.length>8)
  return null;
 let total=0;
 const repetitions=new Map<string,Array<{action:string;performance:string;edit:string}>>();
 const normalize=(value:string)=>value.normalize('NFKC').toLocaleLowerCase('ru-RU')
  .replace(/\s+/gu,' ').trim();
 for(const shot of value.scenes){
  if(!obj(shot)||typeof shot.durationSec!=='number'||!Number.isInteger(shot.durationSec)||shot.durationSec<2||shot.durationSec>12||
   !text(shot.line,2,180)||!text(shot.action,6,320)||
   !['close-up','medium','detail'].includes(String(shot.framing))||
   !text(shot.camera,5,450)||!text(shot.lighting,5,450)||
   !text(shot.performance,5,450)||!text(shot.edit,5,450))return null;
  const line=normalize(shot.line as string);
  const same=repetitions.get(line)??[];
  same.push({action:normalize(shot.action as string),
   performance:normalize(shot.performance as string),
   edit:normalize(shot.edit as string)});
  repetitions.set(line,same);
  total+=shot.durationSec as number;
 }
 // A three- or four-part refrain can be an intentional genre study.
 // Allow it only when each action, acting task and cut is distinct.
 // This structural allowance never implies artistic or author approval.
 for(const parts of repetitions.values()){
  if(parts.length===1)continue;
  if(parts.length<3||parts.length>4||
   new Set(parts.map(part=>part.action)).size!==parts.length||
   new Set(parts.map(part=>part.performance)).size!==parts.length||
   new Set(parts.map(part=>part.edit)).size!==parts.length)return null;
 }
 if(total<15||total>70)return null;
 return value as PersonaDirectorProposal;
}
/** A genuine model output maps into the SAME canonical ProductionBrief as the manual guide.
 * An AI proposal always creates an UNAPPROVED candidate. Never treats it as finished video.
 */
export function personaDirectorToBrief(
 idea:PersonaProductionIdea,proposal:PersonaDirectorProposal,
):PersonaProductionBrief{
 const p=readPersonaDirectorProposal(proposal,idea.id);
 if(!p||!['reel','short','story'].includes(idea.format))throw Error('Invalid AI director proposal');
 const base=buildPersonaProductionBrief({idea});
 const script=p.scenes.map((scene,i)=>({
  order:i+1,durationSec:scene.durationSec,line:scene.line.trim(),action:scene.action.trim(),
 }));
 const shots=p.scenes.map((scene,i)=>({
  order:i+1,durationSec:scene.durationSec,framing:scene.framing,
  angle:scene.camera,cameraMovement:'Штатив или движение только по смыслу, как описано в указании камеры.',
  lighting:scene.lighting,action:scene.action,
 }));
 const durationSec=script.reduce((sum,s)=>sum+s.durationSec,0);
 // Stable, explicitly typed variants for TypeScript NodeNext serverless builds.
 // Object.entries can widen values to unknown and reject object spread.
 const adaptations:PersonaProductionBrief['adaptations']={
  reels:{...base.adaptations.reels,durationSec},
  shorts:{...base.adaptations.shorts,durationSec},
  vkClips:{...base.adaptations.vkClips,durationSec},
 };
 return {
  ...base,hook:{firstSeconds:p.hook,visual:p.scenes[0].action,
   delivery:p.scenes[0].performance},
  script,shots,adaptations,
  preEditPlan:{
   version:1,kind:'persona-pre-edit-plan-v1',status:'intent_only',
   origin:'ai_director',sourceRevisionId:null,
   researchEvidence:{
    level:'hypothesis_only',sourceUrls:[],
    note:'AI-режиссёр предложил монтаж; проверенные показатели Instagram и просмотр референсов не предоставлены.',
   },
   scenes:p.scenes.map((scene,i)=>({
    order:i+1,line:scene.line.trim(),durationSec:scene.durationSec,
    editIntent:scene.edit.trim(),
    audioIntent:'Запись реального звука; музыкальный акцент только после проверки доступной музыки.',
    subtitleIntent:'Сверить с реально произнесёнными словами и безопасными зонами платформы.',
    visualIntent:{framing:scene.framing,angle:scene.camera,cameraMovement:'Штатив или движение только по смыслу, как описано в указании камеры.',lighting:scene.lighting,performance:scene.performance},
    mediaStatus:'awaiting_author_footage' as const,
   })),
   colorIntent:p.colorIntent,
   publicationApproved:false,
  },
  capture:{...base.capture,location:p.setup.location,lighting:p.setup.lighting,
   wardrobe:p.setup.wardrobe,audio:{...base.capture.audio,recording:p.setup.sound}},
  postProduction:{...base.postProduction,transitions:p.editingIntent,color:p.colorIntent},
 };
}
