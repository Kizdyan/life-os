import type { ScenarioScriptBeat } from '../../../packages/core/src/persona-scenario-intelligence';

/** Private, per-project crash/reload journal. This is NOT an approved script revision. */
export type PersonaScenarioDraftJournal={
 version:1;
 projectId:string;
 ideaId:string;
 sourceRevisionId:string;
 beats:ScenarioScriptBeat[];
 reason:string;
 savedAt:string;
};
type DraftStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const PREFIX='lifeos:persona:unsaved-script:v1:';
const unavailableDraftStorage:DraftStorage={
 getItem:()=>null,
 setItem:()=>{throw Error('persona_draft_storage_unavailable')},
 removeItem:()=>{throw Error('persona_draft_storage_unavailable')},
};
/** SSR-safe: tests and server rendering have no browser localStorage. */
export function resolvePersonaScenarioDraftStorage():DraftStorage{
 try{return typeof window!=='undefined'&&window.localStorage?window.localStorage:unavailableDraftStorage}
 catch{return unavailableDraftStorage}
}
export function personaDraftKey(projectId:string){return PREFIX+encodeURIComponent(projectId)}
function validDraft(value:unknown,projectId:string):value is PersonaScenarioDraftJournal{
 if(!value||typeof value!=='object')return false;
 const d=value as Partial<PersonaScenarioDraftJournal>;
 return d.version===1&&d.projectId===projectId&&typeof d.ideaId==='string'&&d.ideaId.length>0&&d.ideaId.length<=200&&
  typeof d.sourceRevisionId==='string'&&d.sourceRevisionId.length>0&&d.sourceRevisionId.length<=200&&
  typeof d.reason==='string'&&d.reason.length<=2000&&typeof d.savedAt==='string'&&
  Array.isArray(d.beats)&&d.beats.length>=3&&d.beats.length<=12&&d.beats.every(b=>
   b&&['hook','development','ending'].includes(b.purpose)&&typeof b.line==='string'&&b.line.length<=10000&&
   typeof b.action==='string'&&b.action.length<=10000&&Number.isFinite(b.durationSec)&&b.durationSec>=0);
}
/** Never delete a corrupt journal here; the user may still need its original bytes. */
export function readPersonaScenarioDraft(storage:DraftStorage,projectId:string):PersonaScenarioDraftJournal|null{
 try{const raw=storage.getItem(personaDraftKey(projectId));if(!raw)return null;
  const decoded:unknown=JSON.parse(raw);return validDraft(decoded,projectId)?decoded:null;
 }catch{return null}
}
/** Only resurrect a draft for exactly its originating idea and revision. */
export function matchingPersonaScenarioDraft(
 storage:DraftStorage,projectId:string,
 script:{idea:{id:string};currentRevisionId:string}|undefined,
):PersonaScenarioDraftJournal|null{
 if(!script)return null;
 const saved=readPersonaScenarioDraft(storage,projectId);
 return saved&&saved.ideaId===script.idea.id&&saved.sourceRevisionId===script.currentRevisionId?saved:null;
}
/** A pending journal may not be overwritten or ignored, even when malformed. */
export function personaScenarioDraftExists(storage:DraftStorage,projectId:string):boolean{
 try{return storage.getItem(personaDraftKey(projectId))!==null}catch{return true}
}
/** Optimistic snapshot check: refuse to overwrite a draft changed since this editor last read it. */
export function savePersonaScenarioDraft(
 storage:DraftStorage,draft:PersonaScenarioDraftJournal,expectedPreviousRaw:string|null,
):string{
 if(!validDraft(draft,draft.projectId))throw Error('invalid_persona_scenario_draft');
 const key=personaDraftKey(draft.projectId);
 const previous=storage.getItem(key);
 if(previous!==expectedPreviousRaw)throw Error('persona_scenario_draft_changed_before_write');
 if(previous!==null&&!readPersonaScenarioDraft(storage,draft.projectId))
  throw Error('corrupt_persona_scenario_draft_preserved');
 const serialized=JSON.stringify(draft);
 storage.setItem(key,serialized);
 return serialized;
}
/** Snapshot-checked delete: refuse to remove a draft changed since this editor last read it. */
export function clearPersonaScenarioDraft(
 storage:DraftStorage,projectId:string,expectedRaw:string|null,
){
 const key=personaDraftKey(projectId);
 const current=storage.getItem(key);
 if(current!==expectedRaw)throw Error('persona_scenario_draft_changed_before_clear');
 if(current!==null)storage.removeItem(key);
}
export function readPersonaScenarioDraftRaw(storage:DraftStorage,projectId:string):string|null{
 try{return storage.getItem(personaDraftKey(projectId))}catch{return null}
}
/** Finalization must not proceed while any local draft exists or changed out of band. */
export function assertNoPersonaScenarioDraft(
 storage:DraftStorage,projectId:string,expectedRaw:string|null,
){
 const current=storage.getItem(personaDraftKey(projectId));
 if(current!==expectedRaw)throw Error('persona_scenario_draft_changed_in_another_instance');
 if(current!==null)throw Error('persona_scenario_draft_pending');
}
