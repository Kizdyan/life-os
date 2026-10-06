export type PersonaIdeaFormat='carousel'|'photo'|'reel'|'short'|'story';
export type PersonaShotSize='wide'|'medium'|'medium-close'|'close-up'|'detail';
export interface PersonaShot{id:string;purpose:string;shotSize:PersonaShotSize;angle:string;cameraPosition:string;cameraHeight:string;distance:string;composition:string;movement:string;durationSeconds:number;takes:number;action:string;dialogue:string|null;bRoll:boolean;bRollInstruction:string|null}
export interface PersonaShootingBrief{title:string;orientation:'vertical'|'horizontal';resolution:'1080p'|'4k';fps:24|25|30|50|60;audio:string;lighting:string;background:string;shots:PersonaShot[];references:string[]}
export interface PersonaIdea{id:string;title:string;angle:string;format:PersonaIdeaFormat;score:number;reason?:string;status?:string;shootingBrief?:PersonaShootingBrief;shootingBriefUpdatedAt?:string}
interface StorageLike{getItem(key:string):string|null;setItem(key:string,value:string):void}
export const PERSONA_IDEAS_STORAGE='lifeos:persona:ideas:v3';
export function attachShootingBrief(ideas:PersonaIdea[],ideaId:string,brief:PersonaShootingBrief,updatedAt=new Date().toISOString()):PersonaIdea[]{return ideas.map(idea=>idea.id===ideaId?{...idea,shootingBrief:brief,shootingBriefUpdatedAt:updatedAt}:idea)}
export function mergePersonaIdeas(planned:PersonaIdea[],persisted:PersonaIdea[]):PersonaIdea[]{const byId=new Map(persisted.map(x=>[x.id,x])),byTitle=new Map(persisted.map(x=>[x.title.toLowerCase(),x]));return planned.map(next=>{const previous=byId.get(next.id)??byTitle.get(next.title.toLowerCase());return previous?.shootingBrief?{...next,shootingBrief:previous.shootingBrief,shootingBriefUpdatedAt:previous.shootingBriefUpdatedAt}:next})}
export function readPersonaIdeas(storage:StorageLike,key=PERSONA_IDEAS_STORAGE):PersonaIdea[]{try{const parsed=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(parsed)?parsed:[]}catch{return[]}}
export function writePersonaIdeas(storage:StorageLike,ideas:PersonaIdea[],key=PERSONA_IDEAS_STORAGE):void{storage.setItem(key,JSON.stringify(ideas))}
