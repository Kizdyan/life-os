import { canPublishPersonaCandidate } from './persona-approval';
import type { PersonaApprovalRecord, PersonaPlatform, PersonaPlatformVariant, PersonaPublicationJob } from './persona-state';

export interface PersonaPublishVerification{found:boolean;externalId:string|null;externalUrl:string|null;}
export interface PersonaPublishResult{externalId:string;externalUrl:string|null;}
export interface PersonaPublisher{platform:PersonaPlatform;verify(job:PersonaPublicationJob,variant:PersonaPlatformVariant):Promise<PersonaPublishVerification>;publish(job:PersonaPublicationJob,variant:PersonaPlatformVariant):Promise<PersonaPublishResult>;}

export function createPersonaPublicationJobs(approval:PersonaApprovalRecord|null|undefined,variants:PersonaPlatformVariant[],now:string):PersonaPublicationJob[]{
 if(!canPublishPersonaCandidate(approval))throw new Error('Explicit Persona approval is required before publication');
 return variants.filter(v=>v.candidateId===approval!.candidateId&&v.revision===approval!.revision).map(v=>({id:`persona-pub:${v.candidateId}:${v.platform}:r${v.revision}`,candidateId:v.candidateId,platform:v.platform,state:'approved',idempotencyKey:`${v.candidateId}:${v.platform}:${v.revision}`,scheduledAt:null,externalId:null,externalUrl:null,attempts:0,lastError:null,createdAt:now,updatedAt:now}));
}

export async function publishPersonaJob(job:PersonaPublicationJob,variant:PersonaPlatformVariant,publisher:PersonaPublisher,now:string):Promise<PersonaPublicationJob>{
 if(job.platform!==variant.platform||publisher.platform!==job.platform)throw new Error('Persona publication platform mismatch');
 if(job.candidateId!==variant.candidateId)throw new Error('Persona publication candidate mismatch');
 if(job.state==='verified')return job;
 const verified=await publisher.verify(job,variant);
 if(verified.found)return{...job,state:'verified',externalId:verified.externalId,externalUrl:verified.externalUrl,lastError:null,updatedAt:now};
 try{
  const published=await publisher.publish({...job,state:'publishing',updatedAt:now},variant);
  return{...job,state:'published',externalId:published.externalId,externalUrl:published.externalUrl,attempts:job.attempts+1,lastError:null,updatedAt:now};
 }catch(error){
  return{...job,state:'retry_wait',attempts:job.attempts+1,lastError:error instanceof Error?error.message:String(error),updatedAt:now};
 }
}
