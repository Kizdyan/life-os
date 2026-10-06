export type PersonaFormat='carousel'|'reel'|'story'|'long_video';
export interface PersonaPreference{key:string;value:string;weight:number;evidenceCount:number;updatedAt:string}
export interface PersonaFeedback{kind:'choice'|'correction'|'approval'|'rejection';key:string;value:string;accepted:boolean;at:string}
export interface PersonaTopic{id:string;title:string;pillar:'actor'|'creator'|'person'|'journey';baseScore:number}
export interface PersonaCandidate{id:string;title:string;format:string;score:number}

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
export function rankPersonaTopics(topics:PersonaTopic[],memory:PersonaPreference[]):PersonaTopic[]{return[...topics].sort((a,b)=>score(b)-score(a));function score(t:PersonaTopic){return t.baseScore+memory.filter(p=>(p.key==='pillar'&&p.value===t.pillar)||(p.key==='topic'&&p.value===t.id)).reduce((s,p)=>s+p.weight,0)}}
export function rankPersonaCandidates<T extends PersonaCandidate>(candidates:T[],memory:PersonaPreference[]):T[]{return[...candidates].sort((a,b)=>score(b)-score(a));function score(candidate:T){return candidate.score+memory.filter(p=>(p.key==='topic'&&p.value===candidate.id)||(p.key==='format'&&p.value===candidate.format)).reduce((sum,p)=>sum+p.weight,0)}}
