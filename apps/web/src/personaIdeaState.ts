export type PersonaIdeaFormat='carousel'|'photo'|'reel'|'short'|'story';
export type PersonaIdeaStatus='candidate'|'now'|'later'|'rejected'|'used';
export type PersonaShotSize='wide'|'medium'|'medium-close'|'close-up'|'detail';
export interface PersonaShot{id:string;purpose:string;shotSize:PersonaShotSize;angle:string;cameraPosition:string;cameraHeight:string;distance:string;composition:string;movement:string;durationSeconds:number;takes:number;action:string;dialogue:string|null;bRoll:boolean;bRollInstruction:string|null}
export interface PersonaShootingBrief{title:string;orientation:'vertical'|'horizontal';resolution:'1080p'|'4k';fps:24|25|30|50|60;audio:string;lighting:string;background:string;shots:PersonaShot[];references:string[]}
export interface PersonaShootingResult{status:'completed';completedAt:string;shotIds:string[]}
export interface PersonaMarketEvidence{source:string;finding:string;url?:string;asOf?:string}
export interface PersonaQualityVerdict{verdict:'APPROVE'|'REVISE'|'REJECT';score:number;summary:string;risks:string[]}
export interface PersonaIdea{id:string;title:string;angle:string;format:PersonaIdeaFormat;score:number;reason?:string;status?:PersonaIdeaStatus;confidence?:number;estimatedMinutes?:number;estimatedDurationSeconds?:number;hook?:string;script?:string;whyNow?:string[];resources?:string[];soloPlan?:string;helperPlan?:string;marketEvidence?:PersonaMarketEvidence[];qualityVerdict?:PersonaQualityVerdict;shootingBrief?:PersonaShootingBrief;shootingBriefUpdatedAt?:string;shootingResult?:PersonaShootingResult}
interface StorageLike{getItem(key:string):string|null;setItem(key:string,value:string):void}
export const PERSONA_IDEAS_STORAGE='lifeos:persona:ideas:v3';
export function attachShootingBrief(ideas:PersonaIdea[],ideaId:string,brief:PersonaShootingBrief,updatedAt=new Date().toISOString()):PersonaIdea[]{return ideas.map(idea=>idea.id===ideaId?{...idea,shootingBrief:brief,shootingBriefUpdatedAt:updatedAt,shootingResult:undefined}:idea)}
export function completePersonaShooting(ideas:PersonaIdea[],ideaId:string,result:{completedAt:string;shotIds:string[]}):PersonaIdea[]{return ideas.map(idea=>idea.id===ideaId?{...idea,shootingResult:{status:'completed',completedAt:result.completedAt,shotIds:[...result.shotIds]}}:idea)}
export function setPersonaIdeaStatus(ideas:PersonaIdea[],ideaId:string,status:PersonaIdeaStatus):PersonaIdea[]{return ideas.map(idea=>idea.id===ideaId?{...idea,status}:idea)}
export function personaIdeaHistory(ideas:PersonaIdea[]):Array<{title:string;status:'later'|'rejected'|'used'}>{return ideas.flatMap(idea=>idea.status==='later'||idea.status==='rejected'||idea.status==='used'?[{title:idea.title,status:idea.status}]:[])}
function normalizedPersonaTitle(title: string): string {
  return title.trim().toLocaleLowerCase('ru-RU');
}
function sameShootingContract(previous: PersonaIdea, next: PersonaIdea): boolean {
  return normalizedPersonaTitle(previous.title) === normalizedPersonaTitle(next.title) &&
    previous.format === next.format &&
    previous.angle === next.angle &&
    previous.hook === next.hook &&
    previous.script === next.script &&
    previous.soloPlan === next.soloPlan &&
    previous.estimatedDurationSeconds === next.estimatedDurationSeconds;
}
export function mergePersonaIdeas(planned: PersonaIdea[], persisted: PersonaIdea[]): PersonaIdea[] {
  const byId = new Map(persisted.map((idea) => [idea.id, idea]));
  const byTitle = new Map(persisted.map((idea) => [normalizedPersonaTitle(idea.title), idea]));
  return planned.map((next) => {
    const sameId = byId.get(next.id);
    // AI candidate IDs can be reused for completely different themes across runs.
    const previous = sameId && normalizedPersonaTitle(sameId.title) === normalizedPersonaTitle(next.title)
      ? sameId
      : byTitle.get(normalizedPersonaTitle(next.title));
    if (!previous) return next;
    const compatibleBrief = sameShootingContract(previous, next);
    return {
      ...next,
      ...(previous.status ? { status: previous.status } : {}),
      ...(compatibleBrief && previous.shootingBrief
        ? { shootingBrief: previous.shootingBrief, shootingBriefUpdatedAt: previous.shootingBriefUpdatedAt }
        : {}),
      ...(compatibleBrief && previous.shootingResult ? { shootingResult: previous.shootingResult } : {}),
    };
  });
}
export function readPersonaIdeas(storage:StorageLike,key=PERSONA_IDEAS_STORAGE):PersonaIdea[]{try{const parsed=JSON.parse(storage.getItem(key)||'[]');return Array.isArray(parsed)?parsed:[]}catch{return[]}}
export function writePersonaIdeas(storage:StorageLike,ideas:PersonaIdea[],key=PERSONA_IDEAS_STORAGE):void{storage.setItem(key,JSON.stringify(ideas))}
