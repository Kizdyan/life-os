export type PersonaContentFormat='showcase'|'acting'|'comedy';
export const contentFormats:readonly {id:PersonaContentFormat;label:string}[]=[{id:'showcase',label:'Commercial Showcase'},{id:'acting',label:'Acting Range'},{id:'comedy',label:'Self-Irony / Comedy'}];
export type CommercialIdea={id:string;title:string;angle:string;hook:string;skills:{role:'actor'|'director'|'composer';action:string}[];music:string;actingTask:string;sellingEnding:string};
export type CommercialProposal={id:string;contentFormat:PersonaContentFormat;ideas:CommercialIdea[];provider:{model:string;id:string};examplesSha256:string;publicationApproved:false};
export type PersonaCommercialDevelopment={version:1;format:PersonaContentFormat;proposals:CommercialProposal[];selected?:{proposalId:string;ideaId:string}};
export function readCommercialDevelopment(value:unknown):PersonaCommercialDevelopment|null{
 const v=value as PersonaCommercialDevelopment|null;
 if(!v||v.version!==1||!contentFormats.some(f=>f.id===v.format)||!Array.isArray(v.proposals)||v.proposals.length>100||v.proposals.some(p=>!p||!/^[a-f0-9-]{36}$/.test(p.id)||!contentFormats.some(f=>f.id===p.contentFormat)||p.publicationApproved!==false||!p.provider?.model||!Array.isArray(p.ideas)||p.ideas.length<1||p.ideas.length>3||p.ideas.some(i=>!i||!i.title||!i.hook||!i.angle||!i.music||!i.actingTask||!i.sellingEnding||!Array.isArray(i.skills)||i.skills.length!==3)))return null;
 if(v.selected&&!v.proposals.some(p=>p.id===v.selected!.proposalId&&p.ideas.some(i=>i.id===v.selected!.ideaId)))return null;
 return v;
}
export function commercialCreativeSnapshot(project:{title:string;sourceIdea:string;shootingPlan:unknown;scenarioWorkspace?:{script?:{currentRevisionId:string}}}):string{return JSON.stringify([project.title,project.sourceIdea,project.shootingPlan,project.scenarioWorkspace?.script?.currentRevisionId??null])}
