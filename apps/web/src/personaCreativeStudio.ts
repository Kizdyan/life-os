import {readPersonaAiMediaJob} from './personaAiMediaWorker';
import type {PersonaProject,PersonaProjectStage} from './personaProjectStore';

export type CreativeProjectAction={
 status:string;
 action:string;
 step:'idea'|'script'|'guide'|'edit'|'review'|'assets';
};
const stageNames:Record<PersonaProjectStage,string>={
 strategy:'Идея',needs_assets:'Ожидает исходники',production:'В производстве',
 marketing_qa:'Редакторская проверка',media_qa:'Проверка медиа',
 final_qa:'Финальная проверка',approval:'Готово к съёмке',
};

/** Dashboard evidence is derived from persisted project data, not a live ProductionJob lookup. */
export function creativeProjectAction(project:PersonaProject):CreativeProjectAction{
 if(readPersonaAiMediaJob(project.aiMediaJob)?.status==='awaiting-author-review'){
  return {status:'Монтаж ждёт проверки',action:'Проверить монтаж',step:'review'};
 }
 const step=project.lastOpenStep;
 if(step==='script')return {status:stageNames[project.stage],action:'Продолжить сценарий',step:'script'};
 if(step==='edit')return {status:stageNames[project.stage],action:'Открыть монтаж',step:'edit'};
 if(step==='review'||step==='export')return {status:stageNames[project.stage],action:'Проверить материал',step:'review'};
 if(step==='guide')return {status:stageNames[project.stage],action:'Открыть план съёмки',step:'guide'};
 if(step==='assets')return {status:stageNames[project.stage],action:'Добавить исходники',step:'assets'};
 if(project.stage==='approval')return {status:stageNames[project.stage],action:'Открыть план съёмки',step:'guide'};
 if(project.stage==='needs_assets')return {status:stageNames[project.stage],action:'Добавить исходники',step:'assets'};
 return {status:stageNames[project.stage],action:'Продолжить работу',step:'idea'};
}
