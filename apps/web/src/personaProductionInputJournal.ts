import type {PersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
export type ProductionInputDraft={version:1;projectId:string;ideaId:string;base:string;field:string;value:string};
export const productionInputKey=(id:string)=>'lifeos:persona:unsaved-production-input:v1:'+encodeURIComponent(id);
export const productionBriefSnapshot=(brief:PersonaProductionBrief)=>JSON.stringify(brief);
export const readProductionInputRaw=(s:Store,id:string)=>s.getItem(productionInputKey(id));
export function parseProductionInputDraft(raw:string|null,id:string):ProductionInputDraft|null{
 try{
  if(raw===null)return null;
  const d=JSON.parse(raw) as Partial<ProductionInputDraft>;
  return d?.version===1&&d.projectId===id&&typeof d.ideaId==='string'&&!!d.ideaId&&
   typeof d.base==='string'&&d.base.length<=200000&&typeof d.field==='string'&&d.field.length<=80&&
   typeof d.value==='string'&&d.value.length<=10000?d as ProductionInputDraft:null;
 }catch{return null}
}
export function productionInputDraftExists(s:Store,id:string){
 try{return readProductionInputRaw(s,id)!==null}catch{return true}
}
export function saveProductionInputDraft(s:Store,d:ProductionInputDraft,expected:string|null):string{
 if(!parseProductionInputDraft(JSON.stringify(d),d.projectId))throw Error('invalid_production_input_draft');
 const before=readProductionInputRaw(s,d.projectId);
 if(before!==expected)throw Error('production_input_changed_in_another_tab');
 if(before!==null){
  const previous=parseProductionInputDraft(before,d.projectId);
  if(!previous)throw Error('corrupt_production_input_draft_preserved');
  if(previous.ideaId!==d.ideaId||previous.base!==d.base||previous.field!==d.field)
   throw Error('unresolved_production_input_draft');
 }
 const raw=JSON.stringify(d);s.setItem(productionInputKey(d.projectId),raw);return raw;
}
export function clearProductionInputDraft(s:Store,id:string,raw:string){
 if(readProductionInputRaw(s,id)!==raw)throw Error('production_input_changed_before_clear');
 s.removeItem(productionInputKey(id));
}
export function applyProductionInputField(b:PersonaProductionBrief,field:string,value:string):PersonaProductionBrief{
 const m=/^(script|shot):(0|[1-9][0-9]*):(line|action|durationSec|angle|cameraMovement|lighting)$/.exec(field);
 if(!m)throw Error('unknown_production_input_field');
 const [,kind,number,prop]=m,index=Number(number);
 const arr=kind==='script'?b.script:b.shots;
 if(!Number.isSafeInteger(index)||index>=arr.length)throw Error('unknown_production_input_index');
 if(kind==='script'&&!['line','action','durationSec'].includes(prop))throw Error('invalid_script_field');
 if(kind==='shot'&&!['angle','cameraMovement','lighting','action'].includes(prop))throw Error('invalid_shot_field');
 if(prop==='durationSec'){
  const seconds=Number(value);
  if(!value.trim()||!Number.isFinite(seconds)||seconds<=0)throw Error('Длительность должна быть больше нуля.');
  const script=b.script.map((x,i)=>i===index?{...x,durationSec:seconds}:x);
  const shots=b.shots.map((x,i)=>i===index?{...x,durationSec:seconds}:x);
  const total=shots.reduce((sum,x)=>sum+x.durationSec,0);
  return {...b,script,shots,adaptations:{reels:{...b.adaptations.reels,durationSec:total},
   shorts:{...b.adaptations.shorts,durationSec:total},vkClips:{...b.adaptations.vkClips,durationSec:total}}};
 }
 if(!value.trim())throw Error('Нельзя сохранить пустое поле. Текст остаётся в страховочной копии.');
 return kind==='script'?{...b,script:b.script.map((x,i)=>i===index?{...x,[prop]:value}:x)}
  :{...b,shots:b.shots.map((x,i)=>i===index?{...x,[prop]:value}:x)};
}
