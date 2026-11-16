import data from '../../../packages/core/src/persona-architect-ten-reels.json';
import {strategyForArchitect,isPersonaStrategy} from '../../../packages/core/src/persona-strategy.mjs';
import {parseArchitectTimedShots,validateArchitectIdeas} from '../../../packages/core/src/persona-architect-shot-parser.mjs';
import {buildPersonaProductionBrief,type PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';
import {addImportedBriefScenario} from './personaBriefScenarioBridge';
import {createPersonaProject,loadPersonaProjects,validatePersonaProjectCollection,PERSONA_PROJECTS_KEY,type PersonaProjectStorage} from './personaProjectStore';

export const PERSONA_ARCHITECT_IMPORT_HASH='#persona/seed10';
export const PERSONA_ARCHITECT_IDS=Object.freeze(Array.from({length:10},(_,i)=>'reel-'+String(i+1).padStart(2,'0')));
export type PersonaArchitectIdea={id:string;title:string;hook:string;mainShots:string;broll:string;music:string;duration:string};
const entries=validateArchitectIdeas(data) as Array<{item:PersonaArchitectIdea;scenes:Array<{order:number;startSec:number;endSec:number;durationSec:number;action:string}>}>;

function shotFraming(action:string):PersonaProductionBrief['shots'][number]['framing']{
 if(/крупный план|взгляд|лицо|глаза/u.test(action))return 'close-up';
 if(/рук|пальц|клавиш|телефон|аккорд|нота|часы/u.test(action))return 'detail';
 return 'medium';
}
export function buildArchitectProductionBrief(item:PersonaArchitectIdea):PersonaProductionBrief{
 const idea={id:item.id,title:item.title,angle:item.hook,format:'reel' as const};
 const baseline=buildPersonaProductionBrief({idea,sourceFacts:[]});
 const scenes=parseArchitectTimedShots(item.mainShots);
 const script=scenes.map((scene,index)=>({
  order:scene.order,durationSec:scene.durationSec,
  // The first hook is supplied by the Architect. Other source blocks are
  // descriptions, NOT invented spoken dialogue or verified footage.
  line:index===0?item.hook:scene.action,
  action:scene.action,
 }));
 const shots=scenes.map(scene=>({
  order:scene.order,durationSec:scene.durationSec,framing:shotFraming(scene.action),
  angle:'Уточнить с автором; выбранный ракурс не подтверждён',
  cameraMovement:'Согласно сценарию; конкретное движение камеры уточнить',
  lighting:'Свет ещё не поставлен',
  action:scene.action,
 }));
 const durationSec=scenes.at(-1)!.endSec;
 return {...baseline,
  hook:{firstSeconds:item.hook,visual:scenes[0].action,delivery:'Хук из исходного материала Архитектора; темп и произнесение ещё не проверены.'},
  script,shots,
  capture:{...baseline.capture,
   props:[...baseline.capture.props,...item.broll.split(';').map(x=>'Вариант B-roll (не отснят): '+x.trim()).filter(Boolean)],
   audio:{recording:'Музыка и звук ещё не записаны. Исходное пожелание: '+item.music,
    processing:'Монтаж под авторскую музыкальную идею, без утверждения прав и готовой фонограммы.'},
  },
  postProduction:{...baseline.postProduction,
   transitions:'Таймкоды Архитектора: '+item.mainShots+' B-roll варианты (не утверждены): '+item.broll,
  },
  adaptations:{
   reels:{...baseline.adaptations.reels,durationSec},
   shorts:{...baseline.adaptations.shorts,durationSec},
   vkClips:{...baseline.adaptations.vkClips,durationSec},
  },
 };
}

/** Import only on explicit user action; never overwrite any existing project. */
export function seedArchitectProjectsInBrowser(storage:PersonaProjectStorage,now=new Date().toISOString()){
 const existing=loadPersonaProjects(storage,()=> 'unused-seed10-migration-id',()=>now);
 const collisions=entries.filter(({item})=>existing.projects.some(p=>p.id===item.id));
 // Existing project IDs are preserved unchanged. They may be authored edits.
 // Upgrade only untouched Architect seed provenance; never replace an authored strategy
 // or collide with a user-owned project reusing the same id.
 const migrated=existing.projects.map(project=>{
  const entry=entries.find(({item})=>item.id===project.id);
  const original=(project as typeof project & {architectSeed?:{source?:unknown}}).architectSeed?.source;
  if(!entry||JSON.stringify(original)!==JSON.stringify(entry.item)||isPersonaStrategy(project.strategy))return project;
  return {...project,strategy:strategyForArchitect(entry.item),revision:project.revision+1,updatedAt:now};
 });
 const upgrades=migrated.filter((project,i)=>project!==existing.projects[i]).length;
 const newProjects=entries.filter(({item})=>!existing.projects.some(p=>p.id===item.id))
  .map(({item,scenes})=>{
   const brief=buildArchitectProductionBrief(item);
   const pipeline=importPersonaProductionBrief({brief,
    selectedIdea:{id:item.id,title:item.title,angle:item.hook,format:'reel'}});
   if(pipeline.stage!=='QA'||pipeline.materials.shotList?.length!==scenes.length||
      pipeline.statuses.READY_FOR_SHOOT!=='pending')
    throw Error('architect_approval_or_shot_list_mismatch:'+item.id);
   const workspace=addImportedBriefScenario(undefined,brief,now);
   if(workspace.script?.currentRevision.beats.length!==scenes.length)
    throw Error('architect_scene_count_mismatch:'+item.id);
   const project=createPersonaProject({id:item.id,title:item.title,
    contentType:'reel',sourceIdea:item.hook,now});
   return {...project,strategy:strategyForArchitect(item),
    // Browser-only stage mirrors the file-backed WAITING_FOR_FOOTAGE workflow;
    // it is not a live ProductionJob status read.
    stage:'needs_assets' as const,lastOpenStep:'script',
    shootingPlan:pipeline,editPlan:pipeline,scenarioWorkspace:workspace,
    architectSeed:{version:1 as const,source:item,plannedStatus:'WAITING_FOR_FOOTAGE' as const,
     synchronizedWithWorker:false as const},
   };
  });
 if(newProjects.length===0&&upgrades===0)return {created:0,skipped:collisions.length,upgraded:0,collection:existing};
 // One validated atomic localStorage write; never replace or select a user's active project.
 const collection={
  schemaVersion:1 as const,activeProjectId:existing.activeProjectId??(newProjects[0]?.id??null),
  projects:[...migrated,...newProjects],
 };
 // Additional safety before any write: the project store may have changed in a parallel tab.
 const before=storage.getItem(PERSONA_PROJECTS_KEY);
 const current=loadPersonaProjects(storage,()=> 'unused-seed10-recheck',()=>now);
 if(JSON.stringify(current)!==JSON.stringify(existing)||storage.getItem('lifeos:persona:projects:v1')!==before)
  throw Error('persona_store_changed_during_seed');
 const target=JSON.stringify(collection);
 // Validate project snapshots before writing, including the scenario and existing projects.
 validatePersonaProjectCollection(collection);
 storage.setItem(PERSONA_PROJECTS_KEY,target);
 return {created:newProjects.length,skipped:collisions.length,upgraded:upgrades,collection};
}
