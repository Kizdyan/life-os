import type { ScenarioIdea, ScenarioReferenceAnalysis, ScenarioResearchItem, ScenarioScript, ScenarioCreativeProfile } from '../../../packages/core/src/persona-scenario-intelligence';
import type { FormatMemoryObservation } from '../../../packages/core/src/format-memory';
import {validatePersonaProductionGuide,type PersonaProductionGuide} from './personaProductionGuide';
import type {PersonaColorComparisonRecord} from './personaColorComparison';
import {readPersonaAiMediaJob,type PersonaAiMediaJob} from './personaAiMediaWorker';

export type PersonaContentType='reel'|'short'|'story'|'photo'|'carousel';
export type PersonaProjectStage='strategy'|'needs_assets'|'production'|'marketing_qa'|'media_qa'|'final_qa'|'approval';

export type PersonaProject={
 id:string;
 title:string;
 contentType:PersonaContentType;
 sourceIdea:string;
 script:unknown|null;
 shootingPlan:unknown|null;
 editPlan:unknown|null;
 timeline:unknown|null;
 mediaAssets:unknown[];
 cloudAssetRefs:string[];
 processing:unknown|null;
 /** Author-picked color comparison evidence; MP4 bytes remain outside project storage. */
 colorComparison?:PersonaColorComparisonRecord;
 /** Local Worker paths and SHA-bound provenance; never stores MP4 bytes. */
 aiMediaJob?:PersonaAiMediaJob;
 captions:unknown|null;
 socialCaptions:unknown|null;
 stage:PersonaProjectStage;
 qa:unknown|null;
 /** Optional, versioned Scenario Intelligence state. Existing v1 projects stay valid without it. */
 scenarioWorkspace?:PersonaScenarioWorkspace;
 lastOpenStep?:string;
 createdAt:string;
 updatedAt:string;
 schemaVersion:1;
 revision:number;
};

export type PersonaDirectorGenerationMeta={
 version:1;provider:'ollama'|'gateway';model:string;
 variation:'unexpected'|'humor'|'cinematic'|'intimate';
 revisionId:string;createdAt:string;
};
export type PersonaScenarioWorkspace={
 version:1;
 research:ScenarioResearchItem[];
 analyses:ScenarioReferenceAnalysis[];
 ideas:ScenarioIdea[];
 selectedIdeaId?:string;
 script?:ScenarioScript;
 /** Only explicit author approvals are retained as reusable format mechanics. */
 formatMemory?:FormatMemoryObservation[];
 /** Author-controlled project creative profile, not a guessed personality profile. */
 creativeProfile?:ScenarioCreativeProfile;
 /** Rejection feedback remains separate from positive Format Memory. */
 editorialFeedback?:Array<{revisionId:string;comment:string;createdAt:string}>;
 /** Explicit author action only. Locks the exact written LINE in one idea, not global beat numbers. */
 authorLockedLines?:Array<{ideaId:string;index:number;line:string}>;
 /** Project-owned, unapproved creative-to-shoot plan. */
 preProductionGuide?:PersonaProductionGuide;
 /** Evidence of a successful model response, not of a rendered MP4. */
 directorGeneration?:PersonaDirectorGenerationMeta;
};

export type PersonaProjectStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type PersonaProjectCollection={schemaVersion:1;activeProjectId:string|null;projects:PersonaProject[]};
export const PERSONA_PROJECTS_KEY='lifeos:persona:projects:v1';
const CORRUPT_KEY=PERSONA_PROJECTS_KEY+':corrupt';

function isContentType(value:unknown):value is PersonaContentType{return value==='reel'||value==='short'||value==='story'||value==='photo'||value==='carousel'}
function isStage(value:unknown):value is PersonaProjectStage{return value==='strategy'||value==='needs_assets'||value==='production'||value==='marketing_qa'||value==='media_qa'||value==='final_qa'||value==='approval'}
function isScenarioWorkspace(value:unknown):value is PersonaScenarioWorkspace{
 if(!value||typeof value!=='object')return false;
 const workspace=value as Partial<PersonaScenarioWorkspace>;
 if((workspace.directorGeneration!==undefined&&(
  !workspace.directorGeneration||
  workspace.directorGeneration.version!==1||
  !['ollama','gateway'].includes(workspace.directorGeneration.provider)||
  typeof workspace.directorGeneration.model!=='string'||
  workspace.directorGeneration.model.length<1||workspace.directorGeneration.model.length>120||
  !['unexpected','humor','cinematic','intimate'].includes(workspace.directorGeneration.variation)||
  typeof workspace.directorGeneration.revisionId!=='string'||
  workspace.directorGeneration.revisionId.length<1||
  workspace.directorGeneration.revisionId.length>200||
  typeof workspace.directorGeneration.createdAt!=='string'||
  !Number.isFinite(Date.parse(workspace.directorGeneration.createdAt))
 ))||(workspace.preProductionGuide!==undefined&&!validatePersonaProductionGuide(workspace.preProductionGuide))||workspace.version!==1||!Array.isArray(workspace.research)||!Array.isArray(workspace.analyses)||!Array.isArray(workspace.ideas)||(workspace.selectedIdeaId!==undefined&&typeof workspace.selectedIdeaId!=='string')||(workspace.formatMemory!==undefined&&!Array.isArray(workspace.formatMemory))||(workspace.creativeProfile!==undefined&&
 (!Array.isArray(workspace.creativeProfile.priorities)||!Array.isArray(workspace.creativeProfile.constraints)||
 workspace.creativeProfile.priorities.some(value=>typeof value!=='string')||
 workspace.creativeProfile.constraints.some(value=>typeof value!=='string')))||
 (workspace.editorialFeedback!==undefined&&(!Array.isArray(workspace.editorialFeedback)||
 workspace.editorialFeedback.some(item=>!item||typeof item.revisionId!=='string'||typeof item.comment!=='string'||typeof item.createdAt!=='string')))||
 (workspace.authorLockedLines!==undefined&&(!Array.isArray(workspace.authorLockedLines)||
 workspace.authorLockedLines.length>12||
 workspace.authorLockedLines.some(item=>!item||typeof item.ideaId!=='string'||!item.ideaId.trim()||item.ideaId.length>150||
 !Number.isInteger(item.index)||item.index<0||item.index>=12||
 typeof item.line!=='string'||!item.line.trim()||item.line.length>2000)||
 new Set(workspace.authorLockedLines.map(item=>item.ideaId+':'+item.index)).size!==workspace.authorLockedLines.length)))return false;
 if(workspace.research.some(item=>!item||typeof item!=='object')||workspace.analyses.some(item=>!item||typeof item!=='object')||workspace.ideas.some(item=>!item||typeof item!=='object'))return false;
 if(workspace.script===undefined)return true;
 const script=workspace.script as Partial<ScenarioScript>;
 return typeof script.currentRevisionId==='string'&&Array.isArray(script.revisions)&&script.revisions.every(revision=>revision&&typeof revision==='object')&&(!script.approval||typeof script.approval==='object');
}
// A damaged optional comparison record must not quarantine the entire project collection.
// Retain its raw JSON evidence; consumers validate it before trusting or changing it.
function isProject(value:unknown):value is PersonaProject{
 if(!value||typeof value!=='object')return false;
 const project=value as Partial<PersonaProject>;
 return typeof project.id==='string'&&typeof project.title==='string'&&isContentType(project.contentType)&&typeof project.sourceIdea==='string'&&isStage(project.stage)&&typeof project.createdAt==='string'&&typeof project.updatedAt==='string'&&project.schemaVersion===1&&Number.isInteger(project.revision)&&project.revision>0&&Array.isArray(project.mediaAssets)&&Array.isArray(project.cloudAssetRefs)&&(project.lastOpenStep===undefined||typeof project.lastOpenStep==='string')&&(project.scenarioWorkspace===undefined||isScenarioWorkspace(project.scenarioWorkspace));
}
export function validatePersonaProjectCollection(value:unknown):PersonaProjectCollection{
 const parsed=value as Partial<PersonaProjectCollection>;
 if(!parsed||typeof parsed!=='object'||parsed.schemaVersion!==1||!Array.isArray(parsed.projects)||!parsed.projects.every(isProject)||!(typeof parsed.activeProjectId==='string'||parsed.activeProjectId===null))throw new Error('invalid_persona_project_collection');
 if(parsed.projects.length>2000||new Set(parsed.projects.map(project=>project.id)).size!==parsed.projects.length)throw new Error('invalid_persona_project_collection');
 if(parsed.activeProjectId!==null&&!parsed.projects.some(project=>project.id===parsed.activeProjectId))throw new Error('invalid_persona_project_collection');
 return {schemaVersion:1,activeProjectId:parsed.activeProjectId,projects:parsed.projects};
}
function emptyCollection():PersonaProjectCollection{return {schemaVersion:1,activeProjectId:null,projects:[]}}
function readCollection(storage:PersonaProjectStorage):PersonaProjectCollection|null{
 const raw=storage.getItem(PERSONA_PROJECTS_KEY);
 if(raw===null)return null;
 try{
  return validatePersonaProjectCollection(JSON.parse(raw));
 }catch{
  // Preserve every distinct corrupt snapshot. Never overwrite an earlier backup.
  // If storage refuses the backup, keep the original collection key untouched.
  let backupKey:string|null=null;
  for(let slot=1;slot<=1000;slot++){
   const candidate=slot===1?CORRUPT_KEY:`${CORRUPT_KEY}:${slot}`;
   const existing=storage.getItem(candidate);
   if(existing===raw)break;
   if(existing===null){backupKey=candidate;break;}
   if(slot===1000)throw new Error('persona_project_corrupt_backup_limit');
  }
  if(backupKey)storage.setItem(backupKey,raw);
  storage.removeItem(PERSONA_PROJECTS_KEY);
  return null;
 }
}
function parseLegacy<T>(storage:PersonaProjectStorage,key:string):T|null{try{const raw=storage.getItem(key);return raw===null?null:JSON.parse(raw) as T}catch{return null}}

export function createPersonaProject(input:{id:string;title:string;contentType:PersonaContentType;sourceIdea:string;now:string}):PersonaProject{
 return {id:input.id,title:input.title,contentType:input.contentType,sourceIdea:input.sourceIdea,script:null,shootingPlan:null,editPlan:null,timeline:null,mediaAssets:[],cloudAssetRefs:[],processing:null,captions:null,socialCaptions:null,stage:'strategy',qa:null,createdAt:input.now,updatedAt:input.now,schemaVersion:1,revision:1};
}

/** Imported Production Briefs persist scenario, shoot/edit plans and navigation
 * in one project snapshot, without waiting for a React autosave timer. */
/** Persist an editorial milestone as one coherent production snapshot. */
export function applyPersonaProductionMilestone(
 project:PersonaProject,production:unknown,
 options:{stage?:PersonaProjectStage;lastOpenStep?:string;resetQa?:boolean}={},
):PersonaProject{
 return {...project,shootingPlan:production,editPlan:production,
  stage:options.stage??project.stage,
  lastOpenStep:options.lastOpenStep??project.lastOpenStep,
  qa:options.resetQa?null:project.qa};
}

export function applyPersonaImportedProductionBrief(
 project:PersonaProject,production:unknown,workspace:PersonaScenarioWorkspace,
):PersonaProject{
 return applyPersonaProductionMilestone({...project,scenarioWorkspace:workspace},production,
  {stage:'final_qa',lastOpenStep:'script',resetQa:true});
}

function migrateLegacy(storage:PersonaProjectStorage,id:string,now:string):PersonaProjectCollection{
 const idea=parseLegacy<{id?:unknown;title?:unknown;angle?:unknown;format?:unknown}>(storage,'persona:active-idea:v1');
 if(!idea||typeof idea.title!=='string'||typeof idea.angle!=='string'||!isContentType(idea.format))return emptyCollection();
 const project=createPersonaProject({id,title:idea.title,contentType:idea.format,sourceIdea:idea.angle,now});
 project.script=parseLegacy(storage,'persona:active-draft:v1');
 project.qa=parseLegacy(storage,'persona:active-qa:v1');
 project.shootingPlan=parseLegacy(storage,'lifeos:persona:production-draft:v1');
 const stage=parseLegacy<unknown>(storage,'persona:active-stage:v1');
 if(isStage(stage))project.stage=stage;
 const timeline=parseLegacy(storage,'persona:timeline:draft:v1:'+String(idea.id||''));
 if(timeline)project.timeline=timeline;
 return {schemaVersion:1,activeProjectId:id,projects:[project]};
}

export function loadPersonaProjects(storage:PersonaProjectStorage,newId:()=>string,clock:()=>string=()=>new Date().toISOString()):PersonaProjectCollection{
 const saved=readCollection(storage);
 if(saved)return saved;
 const migrated=migrateLegacy(storage,newId(),clock());
 if(migrated.projects.length)storage.setItem(PERSONA_PROJECTS_KEY,JSON.stringify(migrated));
 return migrated;
}

export function validatePersonaProjectSnapshot(value:unknown):PersonaProject{
 if(!isProject(value))throw new Error('invalid_persona_project_snapshot');
 return value;
}

/** Fail closed when a project was updated elsewhere (including another browser tab).
 * Call before constructing an autosave snapshot; never base a save on stale React state.
 * The latest stored scenario is authoritative unless the caller explicitly supplies a new one.
 */
/** Reject async file reads that completed after project navigation or a new save.
 * The caller captures the revision before awaiting file.text() and validates
 * the active project and revision after the await, before applying imported data.
 */
export function assertPersonaAsyncImportTarget(
 collection:PersonaProjectCollection,projectId:string,expectedRevision:number,
):void{
 if(collection.activeProjectId!==projectId)
  throw new Error('Во время чтения файла был открыт другой проект. Импорт отменён.');
 const current=collection.projects.find(project=>project.id===projectId);
 if(!current||current.revision!==expectedRevision)
  throw new Error('Проект изменился во время чтения файла. Импорт отменён, текущая версия сохранена.');
}

export function resolvePersonaProjectSaveBase(
 storage:PersonaProjectStorage, rendered:PersonaProject,
):PersonaProject{
 const saved=loadPersonaProjects(storage,()=> 'unused-persona-migration-id').projects.find(item=>item.id===rendered.id);
 if(!saved)throw new Error('persona_project_missing_at_save');
 if(saved.revision!==rendered.revision)throw new Error('persona_project_changed_since_open');
 return saved;
}

export function savePersonaProject(storage:PersonaProjectStorage,project:PersonaProject,activeProjectId=project.id):PersonaProjectCollection{
 if(!isProject(project))throw new Error('invalid_persona_project');
 const current=readCollection(storage)??emptyCollection();
 const index=current.projects.findIndex(item=>item.id===project.id);
 if(index>=0&&project.revision<=current.projects[index].revision)
  throw new Error('persona_project_stale_save');
 const projects=index<0?[...current.projects,project]:current.projects.map((item,i)=>i===index?project:item);
 const next:PersonaProjectCollection={schemaVersion:1,activeProjectId,projects};
 storage.setItem(PERSONA_PROJECTS_KEY,JSON.stringify(next));
 return next;
}

export function selectPersonaProject(storage:PersonaProjectStorage,id:string|null):PersonaProjectCollection{
 const current=readCollection(storage)??emptyCollection();
 if(id!==null&&!current.projects.some(project=>project.id===id))throw new Error('unknown_persona_project');
 const next={...current,activeProjectId:id};
 storage.setItem(PERSONA_PROJECTS_KEY,JSON.stringify(next));
 return next;
}
