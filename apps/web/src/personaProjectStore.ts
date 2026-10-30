import type { ScenarioIdea, ScenarioReferenceAnalysis, ScenarioResearchItem, ScenarioScript, ScenarioCreativeProfile } from '../../../packages/core/src/persona-scenario-intelligence';
import type { FormatMemoryObservation } from '../../../packages/core/src/format-memory';

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
 if(workspace.version!==1||!Array.isArray(workspace.research)||!Array.isArray(workspace.analyses)||!Array.isArray(workspace.ideas)||(workspace.selectedIdeaId!==undefined&&typeof workspace.selectedIdeaId!=='string')||(workspace.formatMemory!==undefined&&!Array.isArray(workspace.formatMemory))||(workspace.creativeProfile!==undefined&&
 (!Array.isArray(workspace.creativeProfile.priorities)||!Array.isArray(workspace.creativeProfile.constraints)||
 workspace.creativeProfile.priorities.some(value=>typeof value!=='string')||
 workspace.creativeProfile.constraints.some(value=>typeof value!=='string')))||
 (workspace.editorialFeedback!==undefined&&(!Array.isArray(workspace.editorialFeedback)||
 workspace.editorialFeedback.some(item=>!item||typeof item.revisionId!=='string'||typeof item.comment!=='string'||typeof item.createdAt!=='string'))))return false;
 if(workspace.research.some(item=>!item||typeof item!=='object')||workspace.analyses.some(item=>!item||typeof item!=='object')||workspace.ideas.some(item=>!item||typeof item!=='object'))return false;
 if(workspace.script===undefined)return true;
 const script=workspace.script as Partial<ScenarioScript>;
 return typeof script.currentRevisionId==='string'&&Array.isArray(script.revisions)&&script.revisions.every(revision=>revision&&typeof revision==='object')&&(!script.approval||typeof script.approval==='object');
}
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
  storage.setItem(CORRUPT_KEY,raw);
  storage.removeItem(PERSONA_PROJECTS_KEY);
  return null;
 }
}
function parseLegacy<T>(storage:PersonaProjectStorage,key:string):T|null{try{const raw=storage.getItem(key);return raw===null?null:JSON.parse(raw) as T}catch{return null}}

export function createPersonaProject(input:{id:string;title:string;contentType:PersonaContentType;sourceIdea:string;now:string}):PersonaProject{
 return {id:input.id,title:input.title,contentType:input.contentType,sourceIdea:input.sourceIdea,script:null,shootingPlan:null,editPlan:null,timeline:null,mediaAssets:[],cloudAssetRefs:[],processing:null,captions:null,socialCaptions:null,stage:'strategy',qa:null,createdAt:input.now,updatedAt:input.now,schemaVersion:1,revision:1};
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

export function savePersonaProject(storage:PersonaProjectStorage,project:PersonaProject,activeProjectId=project.id):PersonaProjectCollection{
 if(!isProject(project))throw new Error('invalid_persona_project');
 const current=readCollection(storage)??emptyCollection();
 const index=current.projects.findIndex(item=>item.id===project.id);
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
