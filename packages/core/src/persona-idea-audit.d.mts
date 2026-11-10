export type IdeaAuditCriterion='visuality'|'actingRange'|'sellingPotential'|'hook';
export type IdeaAuditReview={ideaId:string;title:string;modelScores:Record<IdeaAuditCriterion,number>;scores:Record<IdeaAuditCriterion,number>;average:number;banal:boolean;showsActing:boolean;reason:string;appliedRules:string[];decision:'selected'|'below_threshold'|'outside_top_two'};
export type IdeaAudit={version:1;kind:'persona-generator-critic-v1';threshold:8;limit:2;selectedIdeaIds:string[];reviews:IdeaAuditReview[];rawResponse:unknown;provider?:{id:string;model:string};sourceIdeasSha256?:string;systemPromptSha256?:string;generatedAt?:string};
export const IDEA_AUDIT_CRITERIA:readonly IdeaAuditCriterion[];
export function evaluateIdeaAudit(ideas:readonly {id:string;title:string}[],reply:unknown):IdeaAudit;
export function verifyIdeaAudit(audit:unknown,ideas?:readonly {id:string;title:string}[]):IdeaAudit;
