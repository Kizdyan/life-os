import type {
  DiveMContentAssessment,
  DiveMContentAssessmentRequest,
  DiveMStrategyService,
  MediaCapabilities,
} from "./media-brain";
import type { CapCutWorkPackage } from "./capcut-work-package";
import { PERSONAL_FORMAT_SEEDS } from "./personal-format-seed";

export interface ContentCandidate { id:string; projectId:string; assetIds:string[]; title:string|null; caption:string|null; workPackage:CapCutWorkPackage; createdAt:string; }
export interface ContentFactory {
  createDraft(input:{projectId:string;assetIds:string[];channel:"instagram"|"youtube"|"other";goal:string;styleMemoryNotes:string[];formatMemoryNotes?:string[];lifeOsContext?:Record<string,unknown>|null;}):Promise<ContentCandidate>;
  reviseDraft(input:{candidate:ContentCandidate;assessment:DiveMContentAssessment;}):Promise<ContentCandidate>;
}
export interface MediaObserver { verifyDraft(candidate:ContentCandidate):Promise<{verified:boolean;notes:string[]}>; verifyPublished(candidateId:string):Promise<{verified:boolean;externalId?:string|null;notes:string[]}>; }
export interface MediaPublisher { publish(candidate:ContentCandidate):Promise<{externalId:string}>; }
export interface MediaReviewRecord { candidateId:string;approved:boolean;feedback:string[];reviewedAt:string; }
export interface DraftPipelineInput { capabilities:MediaCapabilities;strategy:DiveMStrategyService;contentFactory:ContentFactory;observer:MediaObserver;profileId:string;projectId:string;assetIds:string[];channel:"instagram"|"youtube"|"other";goal:string;currentFocus:string[];styleMemoryNotes:string[];formatMemoryNotes?:string[];lifeOsContext?:Record<string,unknown>|null;strategyEvidence?:Record<string,number>; }
export interface DraftPipelineResult { candidate:ContentCandidate;assessment:DiveMContentAssessment|null;observerNotes:string[];readyForReview:boolean; }

const MAX_AUTONOMOUS_QA_REPAIRS=2;

export async function prepareContentForReview(input:DraftPipelineInput):Promise<DraftPipelineResult>{
 const formatMemoryNotes=resolveFormatMemoryNotes(input);
 let candidate=await input.contentFactory.createDraft({projectId:input.projectId,assetIds:input.assetIds,channel:input.channel,goal:input.goal,styleMemoryNotes:input.styleMemoryNotes,formatMemoryNotes,lifeOsContext:input.capabilities.lifeOsContextEnabled?input.lifeOsContext??null:null});
 let assessment:DiveMContentAssessment|null=null;
 if(input.capabilities.useDiveMPrePublishAnalysis){
  const request:DiveMContentAssessmentRequest={profileId:input.profileId,projectId:input.projectId,assetIds:input.assetIds,channel:input.channel,goal:input.goal,currentFocus:input.currentFocus,proposedHook:candidate.workPackage.hook,proposedStructure:candidate.workPackage.clips.map(c=>`${c.order}:${c.reason}`),evidence:input.strategyEvidence};
  assessment=await input.strategy.assessContent(request);
  if(assessment.revisionSuggestions.length>0) candidate=await input.contentFactory.reviseDraft({candidate,assessment});
 }
 let observed=await input.observer.verifyDraft(candidate);
 for(let attempt=0;!observed.verified&&attempt<MAX_AUTONOMOUS_QA_REPAIRS;attempt++){
  const repairAssessment:DiveMContentAssessment={fit:"mixed",notes:[...observed.notes],weakTransition:null,revisionSuggestions:observed.notes.map(note=>`Исправь проблему QA: ${note}`),confidence:1,evidenceState:"sufficient"};
  candidate=await input.contentFactory.reviseDraft({candidate,assessment:repairAssessment});
  observed=await input.observer.verifyDraft(candidate);
 }
 return{candidate,assessment,observerNotes:observed.notes,readyForReview:observed.verified};
}

export async function publishReviewedContent(input:{capabilities:MediaCapabilities;candidate:ContentCandidate;review:MediaReviewRecord|null;publisher:MediaPublisher;observer:MediaObserver;}):Promise<{published:boolean;externalId:string|null;verified:boolean;notes:string[]}>{
 if(input.capabilities.approvalBeforePublish&&(!input.review?.approved||input.review.candidateId!==input.candidate.id))return{published:false,externalId:null,verified:false,notes:["Publication requires explicit approval for this exact candidate."]};
 const published=await input.publisher.publish(input.candidate);const verification=await input.observer.verifyPublished(input.candidate.id);return{published:true,externalId:published.externalId,verified:verification.verified,notes:verification.notes};
}
function resolveFormatMemoryNotes(input:DraftPipelineInput):string[]{if(input.formatMemoryNotes&&input.formatMemoryNotes.length>0)return[...input.formatMemoryNotes];if(input.capabilities.usePersonalFormatSeed!==true)return[];return PERSONAL_FORMAT_SEEDS.map(seed=>`${seed.formatKey}: ${seed.mechanics.join("; ")}`)}
