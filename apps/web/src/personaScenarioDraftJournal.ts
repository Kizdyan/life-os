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
export function personaDraftKey(projectId:string){return PREFIX+encodeURIComponent(projectId)}
function validDraft(value:unknown,projectId:string):value is PersonaScenarioDraftJournal{
 if(!value||typeof value!=='object')return false;
 const d=value as Partial<PersonaScenarioDraftJournal>;
 return d.version===1&&d.projectId===projectId&&typeof d.ideaId==='string'&&d.ideaId.length>0&&d.ideaId.length<=200&&
  typeof d.sourceRevisionId==='string'&&d.sourceRevisionId.length>0&&d.sourceRevisionId.length<=200&&
  typeof d.reason==='string'&&d.reason.length<=2000&&typeof d.savedAt==='string'&&
  Array.isArray(d.beats)&&d.beats.length>=3&&d.beats.length<=12&&d.beats.every(b=>
   b&&['hook','development','ending'].includes(b.purpose)&&typeof b.line==='string'&&b.line.length<=10000&&
   typeof b.action==='string'&&b.action.length<=10000&&Number.isFinite(b.durationSec)&&b.durationSec>0);
}
/** Never delete a corrupt journal here; the user may still need its original bytes. */
export function readPersonaScenarioDraft(storage:DraftStorage,projectId:string):PersonaScenarioDraftJournal|null{
 try{const raw=storage.getItem(personaDraftKey(projectId));if(!raw)return null;
  const decoded:unknown=JSON.parse(raw);return validDraft(decoded,projectId)?decoded:null;
 }catch{return null}
}
export function savePersonaScenarioDraft(storage:DraftStorage,draft:PersonaScenarioDraftJournal){
 if(!validDraft(draft,draft.projectId))throw Error('invalid_persona_scenario_draft');
 storage.setItem(personaDraftKey(draft.projectId),JSON.stringify(draft));
}
export function clearPersonaScenarioDraft(storage:DraftStorage,projectId:string){
 storage.removeItem(personaDraftKey(projectId));
}
