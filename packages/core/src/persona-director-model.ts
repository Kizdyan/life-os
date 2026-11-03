import {
 buildPersonaProductionBrief,
 type PersonaProductionBrief,
 type PersonaProductionIdea,
} from './persona-production-brief';

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
 const unique=new Set<string>();
 for(const shot of value.scenes){
  if(!obj(shot)||!Number.isInteger(shot.durationSec)||shot.durationSec<2||shot.durationSec>12||
   !text(shot.line,2,180)||!text(shot.action,6,320)||
   !['close-up','medium','detail'].includes(String(shot.framing))||
   !text(shot.camera,5,450)||!text(shot.lighting,5,450)||
   !text(shot.performance,5,450)||!text(shot.edit,5,450))return null;
  const normalized=(shot.line as string).trim().toLowerCase().replace(/\s+/g,' ');
  if(unique.has(normalized))return null;
  unique.add(normalized);
  total+=shot.durationSec as number;
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
 const adaptations=Object.fromEntries(Object.entries(base.adaptations)
  .map(([key,adaptation])=>[key,{...adaptation,durationSec}])) as PersonaProductionBrief['adaptations'];
 return {
  ...base,hook:{firstSeconds:p.hook,visual:p.scenes[0].action,
   delivery:p.scenes[0].performance},
  script,shots,adaptations,
  capture:{...base.capture,location:p.setup.location,lighting:p.setup.lighting,
   wardrobe:p.setup.wardrobe,audio:{...base.capture.audio,recording:p.setup.sound}},
  postProduction:{...base.postProduction,transitions:p.editingIntent,color:p.colorIntent},
 };
}
