import type {PersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import type {PersonaScenarioWorkspace} from './personaProjectStore';
import {
 actorComposerShotDirections,defaultGuideFields,exampleActorComposerBeats,
 exampleActorComposerSourceFiles,generalGuideFields,guideShotNoteForScene,
 productionGuideScenes,type PersonaGuideScene,
} from './personaProductionGuide';

import type {PersonaScenarioWorkspace} from './personaProjectStore';
import type {PersonaProductionPipeline} from '../../../packages/core/src/persona-production-pipeline';
import {
 actorComposerShotDirections,createPersonaProductionGuide,exampleActorComposerBeats,
 exampleActorComposerSourceFiles,guideShotNoteForScene,productionGuideScenes,
 type PersonaProductionGuide,
} from './personaProductionGuide';

/**
 * One-screen shoot execution data, not an approval or evidence of filmed media.
 * A project-specific checklist is scoped to the exact edited scene sequence.
 */
export type PersonaShootScene={
 id:string;seconds:number;line:string;action:string;
 framing:string;lighting:string;camera:string;performance:string;edit:string;
 sourceFileName?:string;
};
export type PersonaShootSetup={
 location:string;camera:string;lighting:string;sound:string;
 wardrobe:string;arrangement:string;
};
export type PersonaShootPlan={
 title:string;setup:PersonaShootSetup;scenes:PersonaShootScene[];
 status:'example'|'draft'|'approved';
};

/** A single truthful execution view of the canonical screenplay. The pilot is
 * visible only in the explicitly selected Actor+Composer project. */
export function derivePersonaShootPlan({
 title,pilot,workspace,pipeline,
}:{
 title:string;pilot:boolean;
 workspace?:PersonaScenarioWorkspace;
 pipeline:PersonaProductionPipeline|null;
}):PersonaShootPlan{
 const guide=workspace?.preProductionGuide;
 const fields=guide?.fields??(pilot?defaultGuideFields:generalGuideFields);
 const sourceBrief=pipeline?.materials.productionBrief??null;
 const liveBeats=workspace?.script?.currentRevision.beats;
 const hasLiveScript=Boolean(liveBeats?.length);
 const scriptDifferent=Boolean(sourceBrief&&hasLiveScript&&(
  sourceBrief.script.length!==liveBeats!.length||
  liveBeats!.some((beat,i)=>beat.line!==sourceBrief.script[i]?.line||
   beat.action!==sourceBrief.script[i]?.action||beat.durationSec!==sourceBrief.script[i]?.durationSec)
 ));
 const fromBeats=hasLiveScript?liveBeats!.map((beat,i):PersonaGuideScene=>({
  id:String(i+1),seconds:beat.durationSec,line:beat.line,action:beat.action,
  framing:scriptDifferent?'Крупность нужно пересогласовать с новым сценарием':
   sourceBrief?.shots[i]?.framing??'План требует уточнения',
  lighting:scriptDifferent?'Перепроверь свет по новой редакции':
   sourceBrief?.shots[i]?.lighting??fields.keyLight,
  angle:scriptDifferent?undefined:sourceBrief?.shots[i]?.angle,
  source:'brief',
 })):null;
 const fromBrief=!hasLiveScript&&sourceBrief?productionGuideScenes(sourceBrief):null;
 const example=!fromBeats&&!fromBrief&&pilot;
 const scenes=fromBeats??fromBrief??(example?exampleActorComposerBeats.map(beat=>({...beat,source:'example' as const})):[]);
 const exactPilot=pilot&&scenes.length===exampleActorComposerBeats.length&&
  scenes.every((scene,i)=>scene.line===exampleActorComposerBeats[i].line&&
   scene.action===exampleActorComposerBeats[i].action&&
   scene.seconds===exampleActorComposerBeats[i].seconds);
 const scriptApproved=Boolean(hasLiveScript&&workspace?.script?.approval?.revisionId===
  workspace?.script?.currentRevisionId);
 const briefApproved=Boolean(pipeline?.stage==='READY_FOR_SHOOT'&&
  pipeline?.materials.editorialDecision?.decision==='approved');
 const approved=Boolean(sourceBrief&&!scriptDifferent&&briefApproved&&
  (scriptApproved||!hasLiveScript));
 const shots:PersonaShootScene[]=scenes.map((scene,index)=>{
  const sourceBeat=exampleActorComposerBeats[index];
  const directions=exactPilot&&sourceBeat?actorComposerShotDirections[sourceBeat.id]:null;
  const stored=guide?guideShotNoteForScene(guide,scene):null;
  const note=stored?.note&&!stored.stale?stored.note:null;
  return {
   id:scene.id,seconds:scene.seconds,line:scene.line,action:scene.action,
   framing:scene.framing,lighting:note?.lighting??scene.lighting,
   camera:note?.camera??directions?.camera??(
    'angle' in scene&&typeof scene.angle==='string'&&scene.angle?
     scene.angle:'Камера: уточнить ракурс, высоту и расстояние перед дублем'),
   performance:note?.performance??directions?.performance??scene.action,
   edit:note?.edit??directions?.edit??fields.editing,
   ...(exactPilot&&sourceBeat?{sourceFileName:exampleActorComposerSourceFiles[sourceBeat.id]}:{}),
  };
 });
 return {title,status:example?'example':approved?'approved':'draft',scenes:shots,
  setup:{location:fields.location,camera:fields.camera,lighting:fields.keyLight,
   sound:fields.sound,wardrobe:fields.wardrobeProps,arrangement:fields.setArrangement},
 };
}

export type PersonaShootProgress={
 version:1;fingerprint:string;completedIds:string[];updatedAt:string;
};
export const SHOOT_PROGRESS_PREFIX='persona:shoot-progress:v1:';

const isObject=(value:unknown):value is Record<string,unknown>=>
 value!==null&&typeof value==='object'&&!Array.isArray(value);
export function shootProgressKey(projectId:string):string{
 if(!/^[a-zA-Z0-9_-]{1,128}$/.test(projectId))throw Error('Invalid shoot project ID');
 return SHOOT_PROGRESS_PREFIX+projectId;
}
/** Stable, collision-resistant enough for UI version invalidation (not a cryptographic proof). */
export function shootPlanFingerprint(plan:PersonaShootPlan):string{
 return JSON.stringify(plan.scenes.map(s=>[s.id,s.seconds,s.line,s.action,s.framing,s.camera,s.lighting,s.performance,s.edit]));
}
export function readShootProgress(raw:unknown,plan:PersonaShootPlan):PersonaShootProgress|null{
 if(!isObject(raw)||raw.version!==1||raw.fingerprint!==shootPlanFingerprint(plan)||
  !Array.isArray(raw.completedIds)||raw.completedIds.length>plan.scenes.length||
  typeof raw.updatedAt!=='string'||!Number.isFinite(Date.parse(raw.updatedAt)))return null;
 const known=new Set(plan.scenes.map(s=>s.id)),seen=new Set<string>();
 for(const id of raw.completedIds){
  if(typeof id!=='string'||!known.has(id)||seen.has(id))return null;
  seen.add(id);
 }
 return raw as PersonaShootProgress;
}
export function markShootTake(
 plan:PersonaShootPlan,current:PersonaShootProgress|null,id:string,completed:boolean,now:string,
):PersonaShootProgress{
 if(!plan.scenes.some(s=>s.id===id)||!Number.isFinite(Date.parse(now)))throw Error('Invalid take mark');
 const base=readShootProgress(current,plan);
 const completedIds=new Set(base?.completedIds??[]);
 if(completed)completedIds.add(id);
 else completedIds.delete(id);
 return {version:1,fingerprint:shootPlanFingerprint(plan),
  completedIds:[...completedIds],updatedAt:now};
}
export function shootTimecode(plan:PersonaShootPlan,index:number):string{
 const total=plan.scenes.slice(0,index).reduce((s,scene)=>s+scene.seconds,0);
 return String(Math.floor(total/60)).padStart(2,'0')+':'+String(total%60).padStart(2,'0');
}
export function makeShootSheet(plan:PersonaShootPlan):string{
 const lines=[
  '# '+plan.title,
  '',
  plan.status==='approved'?'Сценарий и Production Brief отмечены как утверждённые в проекте.':
   'РАБОЧИЙ ПЛАН: редакторская приёмка ещё не выполнена; публикация не разрешена.',
  '',
  '## Перед первым дублем',
  'Локация: '+plan.setup.location,
  'Камера: '+plan.setup.camera,
  'Свет: '+plan.setup.lighting,
  'Звук: '+plan.setup.sound,
  'Костюм/реквизит: '+plan.setup.wardrobe,
  'Расстановка: '+plan.setup.arrangement,
  '',
  '## Что снимать по порядку',
  ...plan.scenes.flatMap((s,index)=>[
   '### '+(index+1)+'. '+s.id+' · '+shootTimecode(plan,index)+' · '+s.seconds+' с',
   'Сказать: '+s.line,
   'Действие: '+s.action,
   'План: '+s.framing,
   'Камера: '+s.camera,
   'Свет: '+s.lighting,
   'Игра: '+s.performance,
   'Монтаж: '+s.edit,
   ...(s.sourceFileName?['Имя файла: '+s.sourceFileName]:[]),
   '',
  ]),
  '## Перед монтажом',
  'Проверить речь и звук, снять дополнительные реакции, общий план и детали.',
  'Это съёмочный ориентир, а не автоматически проверенный или опубликованный ролик.',
 ];
 return lines.join('\n');
}

/** Take the current source of truth rather than replacing it with the demo.
 * Never inherit camera notes if a dialogue/action/duration changed.
 */
export function buildPersonaShootPlan(input:{
 title:string;workspace?:PersonaScenarioWorkspace;pipeline:PersonaProductionPipeline|null;
 allowPilot:boolean;
}):PersonaShootPlan{
 const {title,workspace,pipeline,allowPilot}=input;
 const guide:PersonaProductionGuide=workspace?.preProductionGuide??
  createPersonaProductionGuide('2026-01-01T00:00:00.000Z',allowPilot?'actor_composer':'general');
 const brief=pipeline?.materials.productionBrief??null;
 const script=workspace?.script;
 const beats=script?.currentRevision.beats;
 const sameAsBrief=Boolean(brief&&beats&&beats.length===brief.script.length&&beats.every((beat,i)=>
  beat.line===brief.script[i]?.line&&beat.action===brief.script[i]?.action&&
  beat.durationSec===brief.script[i]?.durationSec));
 const useBrief=Boolean(brief&&(!beats?.length||sameAsBrief));
 const isExample=allowPilot&&!brief&&!beats?.length;
 const source=beats?.length?beats.map((beat,i)=>({
  id:String(i+1),seconds:beat.durationSec,line:beat.line,action:beat.action,
  framing:useBrief?brief!.shots[i]?.framing??'Крупность уточняется':'План требует уточнения',
  lighting:useBrief?brief!.shots[i]?.lighting??guide.fields.keyLight:guide.fields.keyLight,
  angle:useBrief?brief!.shots[i]?.angle:undefined,
 })):brief?productionGuideScenes(brief).map(scene=>({
  id:scene.id,seconds:scene.seconds,line:scene.line,action:scene.action,
  framing:scene.framing,lighting:scene.lighting,angle:scene.angle,
 })):isExample?exampleActorComposerBeats.map(beat=>({
  id:beat.id,seconds:beat.seconds,line:beat.line,action:beat.action,
  framing:beat.framing,lighting:beat.lighting,angle:undefined as string|undefined,
 })):[];
 const scenes:PersonaShootScene[]=source.map((scene,i)=>{
  const pilot=allowPilot&&source.length===exampleActorComposerBeats.length&&
   source.every((item,j)=>item.line===exampleActorComposerBeats[j].line&&
    item.action===exampleActorComposerBeats[j].action&&
    item.seconds===exampleActorComposerBeats[j].seconds);
  const directions=pilot?actorComposerShotDirections[exampleActorComposerBeats[i].id]:null;
  const shotEvidence=useBrief&&brief?productionGuideScenes(brief)[i]:null;
  const saved=guideShotNoteForScene(guide,{
   ...scene,source:shotEvidence?'brief':'example',
  }).note;
  const safeNote=guideShotNoteForScene(guide,{
   ...scene,source:shotEvidence?'brief':'example',
  }).stale?null:saved;
  return {
   id:scene.id,seconds:scene.seconds,line:scene.line,action:scene.action,
   framing:scene.framing,lighting:safeNote?.lighting||scene.lighting,
   camera:safeNote?.camera||directions?.camera||scene.angle||guide.fields.camera,
   performance:safeNote?.performance||directions?.performance||scene.action,
   edit:safeNote?.edit||directions?.edit||guide.fields.editing,
   sourceFileName:isExample&&pilot?exampleActorComposerSourceFiles[exampleActorComposerBeats[i].id]:undefined,
  };
 });
 const scriptApproved=Boolean(script?.approval&&script.approval.revisionId===script.currentRevisionId);
 const briefApproved=Boolean(brief&&useBrief&&pipeline?.stage==='READY_FOR_SHOOT'&&
  pipeline.materials.editorialDecision?.decision==='approved');
 return {
  title,status:isExample?'example':scriptApproved&&briefApproved?'approved':'draft',
  setup:{location:guide.fields.location,camera:guide.fields.camera,
   lighting:guide.fields.keyLight,sound:guide.fields.sound,
   wardrobe:guide.fields.wardrobeProps,arrangement:guide.fields.setArrangement},
  scenes,
 };
}
