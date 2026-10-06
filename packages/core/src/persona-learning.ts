import type { StyleMemoryObservation } from './media-brain';
import type { PersonaApprovalRecord } from './persona-state';

export type PersonaFormat='carousel'|'reel'|'story'|'long_video';
export interface PersonaPreference{key:string;value:string;weight:number;evidenceCount:number;updatedAt:string}
export interface PersonaFeedback{kind:'choice'|'correction'|'approval'|'rejection';key:string;value:string;accepted:boolean;at:string}
export interface PersonaTopic{id:string;title:string;pillar:'actor'|'creator'|'person'|'journey';baseScore:number}
export interface PersonaCandidate{id:string;title:string;format:string;score:number}
export interface PersonaContentResult{candidateId:string;measuredAt:string;relativeChange:number|null}

const weekly:Record<number,{format:PersonaFormat;goal:string}>={
 0:{format:'carousel',goal:'сохранения и узнаваемость'},
 1:{format:'reel',goal:'охват'},
 2:{format:'story',goal:'контакт с аудиторией'},
 3:{format:'reel',goal:'охват и характер'},
 4:{format:'carousel',goal:'экспертность и сохранения'},
 5:{format:'reel',goal:'личность и развлечение'},
 6:{format:'story',goal:'живой контакт'},
};
export function personaPlanForDate(iso:string){const d=new Date(iso);const weekday=d.getDay();return{weekday,...weekly[weekday]};}
export function learnPersonaPreference(memory:PersonaPreference[],feedback:PersonaFeedback):PersonaPreference[]{const delta=feedback.accepted?3:-2;const existing=memory.find(x=>x.key===feedback.key&&x.value===feedback.value);if(!existing)return[...memory,{key:feedback.key,value:feedback.value,weight:delta,evidenceCount:1,updatedAt:feedback.at}];return memory.map(x=>x===existing?{...x,weight:Math.max(-20,Math.min(20,x.weight+delta)),evidenceCount:x.evidenceCount+1,updatedAt:feedback.at}:x);}
export function personaPreferencesFromApprovals(candidates:PersonaCandidate[],approvals:PersonaApprovalRecord[]):PersonaPreference[]{const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));let memory:PersonaPreference[]=[];for(const approval of approvals){if(approval.decision!=='approved'&&approval.decision!=='rejected')continue;const candidate=byId.get(approval.candidateId);if(!candidate)continue;const accepted=approval.decision==='approved';const kind=accepted?'approval':'rejection';memory=learnPersonaPreference(memory,{kind,key:'topic',value:candidate.id,accepted,at:approval.decidedAt});memory=learnPersonaPreference(memory,{kind,key:'format',value:candidate.format,accepted,at:approval.decidedAt});}return memory;}
export function personaPreferencesFromStyleMemory(observations:StyleMemoryObservation[]):PersonaPreference[]{const aggregate=new Map<string,PersonaPreference>();for(const observation of observations){const value=observation.value.trim();if(!value)continue;const key=`style:${observation.dimension}`;const id=`${key}\u0000${value}`;const current=aggregate.get(id);if(!current){aggregate.set(id,{key,value,weight:roundPreferenceWeight(observation.weight),evidenceCount:1,updatedAt:observation.createdAt});continue;}current.weight=roundPreferenceWeight(Math.max(-20,Math.min(20,current.weight+observation.weight)));current.evidenceCount+=1;if(observation.createdAt>current.updatedAt)current.updatedAt=observation.createdAt;}return[...aggregate.values()];}
export function personaPreferencesFromContentResults(candidates:PersonaCandidate[],results:PersonaContentResult[]):PersonaPreference[]{const byId=new Map(candidates.map(candidate=>[candidate.id,candidate]));let memory:PersonaPreference[]=[];for(const result of results){if(result.relativeChange===null||!Number.isFinite(result.relativeChange)||result.relativeChange===0)continue;const candidate=byId.get(result.candidateId);if(!candidate)continue;const delta=roundPreferenceWeight(Math.max(-1,Math.min(1,result.relativeChange*2)));memory=applyPreferenceDelta(memory,'topic',candidate.id,delta,result.measuredAt);memory=applyPreferenceDelta(memory,'format',candidate.format,delta,result.measuredAt);}return memory;}
export function rankPersonaTopics(topics:PersonaTopic[],memory:PersonaPreference[]):PersonaTopic[]{return[...topics].sort((a,b)=>score(b)-score(a));function score(t:PersonaTopic){return t.baseScore+memory.filter(p=>(p.key==='pillar'&&p.value===t.pillar)||(p.key==='topic'&&p.value===t.id)).reduce((s,p)=>s+p.weight,0)}}
export function rankPersonaCandidates<T extends PersonaCandidate>(candidates:T[],memory:PersonaPreference[]):T[]{return[...candidates].sort((a,b)=>score(b)-score(a));function score(candidate:T){return candidate.score+memory.filter(p=>(p.key==='topic'&&p.value===candidate.id)||(p.key==='format'&&p.value===candidate.format)).reduce((sum,p)=>sum+p.weight,0)}}
function applyPreferenceDelta(memory:PersonaPreference[],key:string,value:string,delta:number,at:string):PersonaPreference[]{const existing=memory.find(item=>item.key===key&&item.value===value);if(!existing)return[...memory,{key,value,weight:delta,evidenceCount:1,updatedAt:at}];return memory.map(item=>item===existing?{...item,weight:roundPreferenceWeight(Math.max(-20,Math.min(20,item.weight+delta))),evidenceCount:item.evidenceCount+1,updatedAt:at>item.updatedAt?at:item.updatedAt}:item);}
function roundPreferenceWeight(value:number):number{return Math.round(value*100)/100;}
