import fixture from '../../../packages/core/src/persona-demo-project.json';
import {buildPersonaProductionBrief,type PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';
import {addImportedBriefScenario} from './personaBriefScenarioBridge';
import {createPersonaProject,loadPersonaProjects,savePersonaProject,type PersonaProjectStorage} from './personaProjectStore';

/** Browser project list is local-first; no remote ProductionJob status is inferred here. */
export const PERSONA_DEMO_ID=fixture.id;
export const PERSONA_DEMO_LINK_HASH='#persona/demo';

export function buildPersonaDemoBrief():PersonaProductionBrief{
 const idea={id:fixture.id,title:fixture.title,angle:fixture.angle,format:'reel' as const};
 const baseline=buildPersonaProductionBrief({idea,sourceFacts:[]});
 const script=fixture.scenes.map(scene=>({
  order:scene.order,durationSec:scene.durationSec,line:scene.line,action:scene.action,
 }));
 const shots=fixture.shots.map(shot=>({
  ...shot,framing:shot.framing as PersonaProductionBrief['shots'][number]['framing'],
 }));
 const durationSec=script.reduce((sum,scene)=>sum+scene.durationSec,0);
 return {
  ...baseline,
  hook:{
   firstSeconds:script[0].line,
   visual:'Крупный план клавиатуры; изображение является сценарием, а не реальным видео.',
   delivery:'Постановочный текст для демонстрации. Не считать авторским утверждением.',
  },
  script,shots,
  adaptations:{
   reels:{...baseline.adaptations.reels,durationSec},
   shorts:{...baseline.adaptations.shorts,durationSec},
   vkClips:{...baseline.adaptations.vkClips,durationSec},
  },
 };
}

/** Idempotent and append-only: never overwrite a pre-existing demo or any user project. */
export function ensurePersonaDemoProject(storage:PersonaProjectStorage,now=new Date().toISOString()){
 const current=loadPersonaProjects(storage,()=> 'persona-demo-legacy-migration');
 const existing=current.projects.find(project=>project.id===PERSONA_DEMO_ID);
 if(existing)return {created:false,project:existing,collection:current};
 const brief=buildPersonaDemoBrief();
 const pipeline=importPersonaProductionBrief({
  brief,selectedIdea:{id:fixture.id,title:fixture.title,angle:fixture.angle,format:'reel'},
 });
 if(pipeline.stage!=='QA'||pipeline.materials.shotList?.length!==3)
  throw Error('demo_fixture_validation_failed');
 const scenarioWorkspace=addImportedBriefScenario(undefined,brief,now);
 if(scenarioWorkspace.script?.currentRevision.beats.length!==3)
  throw Error('demo_scenario_validation_failed');
 const base=createPersonaProject({
  id:fixture.id,title:fixture.title,contentType:'reel',sourceIdea:fixture.angle,now,
 });
 const project={...base,
  scenarioWorkspace,
  shootingPlan:pipeline,
  editPlan:pipeline,
  lastOpenStep:'script',
  stage:'strategy' as const,
 };
 // Preserve user's active project when one exists; no transition to READY_FOR_SHOOT.
 const collection=savePersonaProject(storage,project,current.activeProjectId??project.id);
 return {created:true,project,collection};
}
