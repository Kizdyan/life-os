import {verifyIdeaAudit,type IdeaAudit} from '../../../packages/core/src/persona-idea-audit.mjs';
export type PersonaContentFormat='showcase'|'acting'|'comedy';
export const contentFormats:readonly {id:PersonaContentFormat;label:string}[]=[{id:'showcase',label:'Commercial Showcase'},{id:'acting',label:'Acting Range'},{id:'comedy',label:'Self-Irony / Comedy'}];
export type CommercialIdea={id:string;title:string;angle:string;hook:string;skills:{role:'actor'|'director'|'composer';action:string}[];music:string;actingTask:string;sellingEnding:string};
export type CommercialProposal={id:string;contentFormat:PersonaContentFormat;ideas:CommercialIdea[];provider:{model:string;id:string};examplesSha256:string;publicationApproved:false;audit?:IdeaAudit};
export type PersonaCommercialDevelopment={version:1;format:PersonaContentFormat;proposals:CommercialProposal[];selected?:{proposalId:string;ideaId:string}};
export function readCommercialDevelopment(value:unknown):PersonaCommercialDevelopment|null{
 const v=value as PersonaCommercialDevelopment|null;
 const text=(s:unknown,max=1000)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
 if(!v||v.version!==1||!contentFormats.some(f=>f.id===v.format)||!Array.isArray(v.proposals)||v.proposals.length>100)return null;
 for(const p of v.proposals){
  if(!p||typeof p.id!=='string'||!/^[a-f0-9-]{36}$/.test(p.id)||!contentFormats.some(f=>f.id===p.contentFormat)||p.publicationApproved!==false||!text(p.provider?.model,120)||!text(p.provider?.id,80)||typeof p.examplesSha256!=='string'||!/^[a-f0-9]{64}$/.test(p.examplesSha256)||!Array.isArray(p.ideas)||p.ideas.length>(p.audit?2:3)||!p.audit&&p.ideas.length<1||p.ideas.some(i=>!i||![i.id,i.title,i.hook,i.angle,i.music,i.actingTask,i.sellingEnding].every(s=>text(s))||!Array.isArray(i.skills)||i.skills.length!==3||new Set(i.skills.map(s=>s?.role)).size!==3||i.skills.some(s=>!s||!['actor','director','composer'].includes(s.role)||!text(s.action))))return null;
  if(p.audit){
   try{
    const audit=verifyIdeaAudit(p.audit);
    if(JSON.stringify(p.ideas.map(i=>i.id))!==JSON.stringify(audit.selectedIdeaIds)||p.ideas.some(i=>i.title!==audit.reviews.find(r=>r.ideaId===i.id)?.title)||p.audit.provider?.model!==p.provider.model||p.audit.provider?.id!==p.provider.id)return null;
   }catch{return null}
  }
 }
 if(v.selected&&!v.proposals.some(p=>p.id===v.selected!.proposalId&&p.ideas.some(i=>i.id===v.selected!.ideaId)))return null;
 return v;
}
export function commercialCreativeSnapshot(project:{title:string;sourceIdea:string;shootingPlan:unknown;scenarioWorkspace?:{script?:{currentRevisionId:string}}}):string{return JSON.stringify([project.title,project.sourceIdea,project.shootingPlan,project.scenarioWorkspace?.script?.currentRevisionId??null])}
