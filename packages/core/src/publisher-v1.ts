import type { DurableRuntimeStore, RuntimeRecord, RuntimeSnapshot, SyncMutation, SyncResult } from './runtime-storage';
import type { PersonaApprovalRecord } from './persona-state';

export type PublicationState = 'DRAFT'|'READY_TO_SCHEDULE'|'READY_TO_PUBLISH'|'SCHEDULED'|'PUBLISHING'|'PUBLISHED_CONFIRMED'|'FAILED'|'CANCELLED';
export type PublicationConnectionState = 'CONNECTED'|'DISCONNECTED'|'AUTH_EXPIRED'|'MISCONFIGURED'|'UNAVAILABLE';
export type PublicationFailureCode = 'ACCOUNT_DISCONNECTED'|'AUTH_EXPIRED'|'PROVIDER_UNAVAILABLE'|'PROVIDER_REJECTED'|'MEDIA_INVALID'|'RATE_LIMITED'|'SCHEDULE_INVALID'|'DUPLICATE_PREVENTED'|'UNKNOWN';
export type PublicationAction = 'MANUAL_EXPORT'|'SHARE_SHEET'|'OPEN_EXTERNAL_APP'|'SCHEDULE_REQUEST'|'PROVIDER_ACCEPTED'|'PUBLISHED_CONFIRMED';
export type PublicationFormat = 'photo_post'|'carousel_post'|'reel'|'story';
export type PublicationPlatform = 'instagram'|'vk'|'youtube';

export interface PublicationMediaAsset { assetId:string; mediaType:'image'|'video'; url:string; mimeType:string; }
export interface PersonaContentPackage {
  packageId:string; contentItemId:string; candidateId:string; generation:number;
  approval:{approvalId:string;candidateId:string;revision:number;decidedAt:string};
  assets:PublicationMediaAsset[]; targetPlatform:PublicationPlatform; targetAccountId:string;
  targetFormat:PublicationFormat; caption:string; metricsLinkageId:string|null;
}
export interface PublicationEvidence {
  provider:string; publicationJobId:string; idempotencyKey:string; generation:number;
  packageFingerprint:string;
  providerPublicationId:string; remoteState:'PUBLISHED'; publishedAt:string;
  targetPlatform:PublicationPlatform; targetAccountId:string; canonicalUrl:string|null;
}
export interface PublicationFailure { code:PublicationFailureCode; message:string; retryable:boolean; }
export interface PublicationAttempt {
  attemptId:string; ordinal:number; ownerId:string; status:'STARTED'|'ACCEPTED'|'UNKNOWN'|'CONFIRMED'|'FAILED'|'STALE';
  providerRequestId:string|null; startedAt:string; finishedAt:string|null; failure:PublicationFailure|null;
}
export interface PublicationJob {
  publicationJobId:string; packageId:string; contentItemId:string; mediaAssetIds:string[];
  targetPlatform:PublicationPlatform; targetAccountId:string; targetFormat:PublicationFormat;
  caption:string; scheduledAt:string|null; timezone:string; generation:number; idempotencyKey:string;
  packageFingerprint:string; packageSnapshot:string;
  provider:string; attempts:PublicationAttempt[]; status:PublicationState; activeAttemptId:string|null;
  externalPublicationId:string|null; createdAt:string; updatedAt:string;
  failure:PublicationFailure|null; evidence:PublicationEvidence|null; metricsLinkageId:string|null;
}
export interface PackageValidation { valid:boolean; failure:PublicationFailure|null; }
export interface ProviderSubmission {
  outcome:'ACCEPTED'|'CONFIRMED'|'UNKNOWN'|'REJECTED'; providerRequestId:string|null;
  evidence:PublicationEvidence|null; failure:PublicationFailure|null;
}
export interface ProviderStatus { state:'PENDING'|'PUBLISHED'|'FAILED'|'NOT_FOUND'|'ABSENT_RETRY_SAFE'; evidence:PublicationEvidence|null; failure:PublicationFailure|null; }
export interface PublisherCall { job:PublicationJob; package:PersonaContentPackage; attemptId:string; }
export interface PublicationApprovalVerifier { verify(pkg:PersonaContentPackage):Promise<boolean>; }
export interface PublisherAdapter {
  readonly provider:string;
  getConnectionStatus(accountId:string):Promise<PublicationConnectionState>;
  canPublish(pkg:PersonaContentPackage):Promise<boolean>;
  validatePackage(pkg:PersonaContentPackage):Promise<PackageValidation>;
  schedule(call:PublisherCall):Promise<ProviderSubmission>;
  publishNow(call:PublisherCall):Promise<ProviderSubmission>;
  getPublicationStatus(job:PublicationJob):Promise<ProviderStatus>;
  cancel(job:PublicationJob):Promise<boolean>;
  getPublicationEvidence(job:PublicationJob):Promise<PublicationEvidence|null>;
  getAnalyticsReference?(job:PublicationJob):Promise<string|null>;
}

export class PublisherRouter {
  private readonly adapters=new Map<string,PublisherAdapter>();
  constructor(adapters:PublisherAdapter[]){for(const adapter of adapters){if(this.adapters.has(adapter.provider))throw new Error(`Duplicate publisher adapter: ${adapter.provider}`);this.adapters.set(adapter.provider,adapter);}}
  get(provider:string){const adapter=this.adapters.get(provider);if(!adapter)throw new Error(`Publisher adapter unavailable: ${provider}`);return adapter;}
}
export class PersonaStateApprovalVerifier implements PublicationApprovalVerifier {
  constructor(private readonly load:(candidateId:string,revision:number)=>Promise<{approval:PersonaApprovalRecord;package:PersonaContentPackage}|null>){ }
  async verify(pkg:PersonaContentPackage){const proof=pkg.approval,resolved=await this.load(proof.candidateId,proof.revision);if(!resolved)return false;const record=resolved.approval;return pkg.candidateId===proof.candidateId&&record.candidateId===pkg.candidateId&&record.decision==='approved'&&record.revision===proof.revision&&record.decidedAt===proof.decidedAt&&proof.approvalId===approvalIdentity(record)&&pkg.generation===record.revision&&canonicalPackage(pkg)===canonicalPackage(resolved.package);}
}
export function approvalIdentity(record:Pick<PersonaApprovalRecord,'candidateId'|'revision'|'decidedAt'>){return `persona-approval:${encodeURIComponent(record.candidateId)}:r${record.revision}:${encodeURIComponent(record.decidedAt)}`;}

/** Server-side bridge to the existing durable runtime mutation boundary (for example Supabase RPC). */
export interface RemotePublicationRuntime {
  apply(principal:string,mutation:Omit<SyncMutation,'userId'|'clientUpdatedAt'>):Promise<SyncResult>;
  listSince(principal:string,sinceRevision:number):Promise<RuntimeRecord[]>;
  revision(principal:string):Promise<number>;
}
export class RemoteDurablePublicationStore implements DurableRuntimeStore {
  constructor(private readonly remote:RemotePublicationRuntime,private readonly principal:string){}
  async read(userId:string,recordId:string){this.assertPrincipal(userId);const records=await this.remote.listSince(this.principal,0);return records.filter(r=>r.id===recordId&&!r.deleted).sort((a,b)=>b.version-a.version)[0]??null;}
  async list(userId:string,sinceRevision=0):Promise<RuntimeSnapshot>{this.assertPrincipal(userId);return{storeRevision:await this.remote.revision(this.principal),records:(await this.remote.listSince(this.principal,sinceRevision)).filter(r=>!r.deleted)};}
  async apply(mutation:SyncMutation){this.assertPrincipal(mutation.userId);const {userId:_,clientUpdatedAt:__,...remoteMutation}=mutation;return this.remote.apply(this.principal,remoteMutation);}
  private assertPrincipal(userId:string){if(userId!==this.principal)throw new Error('Publication durable-store principal mismatch');}
}

export interface MetricoolTransport {
  connection(accountId:string):Promise<PublicationConnectionState>;
  schedule(call:PublisherCall):Promise<ProviderSubmission>;
  publishNow(call:PublisherCall):Promise<ProviderSubmission>;
  status(job:PublicationJob):Promise<ProviderStatus>;
  cancel(job:PublicationJob):Promise<boolean>;
  evidence(job:PublicationJob):Promise<PublicationEvidence|null>;
}
export class MetricoolPublisherAdapter implements PublisherAdapter {
  readonly provider='metricool';
  constructor(private readonly transport:MetricoolTransport|null=null){}
  async getConnectionStatus(accountId:string){return this.transport?this.transport.connection(accountId):'DISCONNECTED' as const;}
  async canPublish(pkg:PersonaContentPackage){return (await this.getConnectionStatus(pkg.targetAccountId))==='CONNECTED'&&(await this.validatePackage(pkg)).valid;}
  async validatePackage(pkg:PersonaContentPackage){return validateInstagramPackage(pkg);}
  async schedule(call:PublisherCall){if(!this.transport)return disconnectedSubmission();return this.transport.schedule(call);}
  async publishNow(call:PublisherCall){if(!this.transport)return disconnectedSubmission();return this.transport.publishNow(call);}
  async getPublicationStatus(job:PublicationJob){if(!this.transport)return {state:'PENDING',evidence:null,failure:failure('PROVIDER_UNAVAILABLE','Metricool status is unavailable; canonical state is preserved',true)} as ProviderStatus;return this.transport.status(job);}
  async cancel(job:PublicationJob){return this.transport?this.transport.cancel(job):false;}
  async getPublicationEvidence(job:PublicationJob){return this.transport?this.transport.evidence(job):null;}
}

/** Deterministic local contract adapter. It is evidence for tests, never a claim of live publication. */
export class DeterministicPublisherAdapter implements PublisherAdapter {
  readonly provider='deterministic-fake';private readonly published=new Map<string,PublicationEvidence>();
  constructor(private readonly options:{now:()=>string;connection?:PublicationConnectionState;confirmImmediately?:boolean}){}
  async getConnectionStatus(){return this.options.connection??'CONNECTED';}
  async canPublish(pkg:PersonaContentPackage){return (await this.getConnectionStatus())==='CONNECTED'&&validateInstagramPackage(pkg).valid;}
  async validatePackage(pkg:PersonaContentPackage){return validateInstagramPackage(pkg);}
  async schedule(call:PublisherCall){return this.submit(call);}
  async publishNow(call:PublisherCall){return this.submit(call);}
  async getPublicationStatus(job:PublicationJob):Promise<ProviderStatus>{const found=this.published.get(job.idempotencyKey);return found?{state:'PUBLISHED',evidence:found,failure:null}:{state:'ABSENT_RETRY_SAFE',evidence:null,failure:null};}
  async cancel(job:PublicationJob){return this.published.delete(job.idempotencyKey)||!this.published.has(job.idempotencyKey);}
  async getPublicationEvidence(job:PublicationJob){return this.published.get(job.idempotencyKey)??null;}
  private async submit(call:PublisherCall):Promise<ProviderSubmission>{const existing=this.published.get(call.job.idempotencyKey);if(existing)return{outcome:'CONFIRMED',providerRequestId:existing.providerPublicationId,evidence:existing,failure:null};const created:PublicationEvidence={provider:this.provider,publicationJobId:call.job.publicationJobId,idempotencyKey:call.job.idempotencyKey,generation:call.job.generation,packageFingerprint:call.job.packageFingerprint,providerPublicationId:`fake:${call.job.idempotencyKey}`,remoteState:'PUBLISHED',publishedAt:this.options.now(),targetPlatform:call.job.targetPlatform,targetAccountId:call.job.targetAccountId,canonicalUrl:null};this.published.set(call.job.idempotencyKey,created);return this.options.confirmImmediately===false?{outcome:'ACCEPTED',providerRequestId:created.providerPublicationId,evidence:null,failure:null}:{outcome:'CONFIRMED',providerRequestId:created.providerPublicationId,evidence:created,failure:null};}
}

export class PublicationEngine {
  constructor(private readonly options:{store:DurableRuntimeStore;router:PublisherRouter;approvalVerifier:PublicationApprovalVerifier;now:()=>string;userId:string}){}
  async create(pkg:PersonaContentPackage,input:{provider:string;scheduledAt?:string|null;timezone:string}):Promise<PublicationJob>{
    const validation=validateInstagramPackage(pkg);if(!validation.valid)throw new Error(validation.failure!.message);
    if(!pkg.approval.approvalId||!Number.isFinite(Date.parse(pkg.approval.decidedAt))||!(await this.options.approvalVerifier.verify(pkg)))throw new Error('Canonical final approval is required');
    const scheduledAt=input.scheduledAt??null;validateSchedule(scheduledAt,input.timezone,nowMs(this.options.now()));
    const packageSnapshot=canonicalPackage(pkg),packageFingerprint=fingerprintPackage(packageSnapshot);
    const idempotencyKey=`pub:${encodeURIComponent(pkg.packageId)}:g${pkg.generation}:${pkg.targetPlatform}:${encodeURIComponent(pkg.targetAccountId)}`;
    const publicationJobId=`publication:${idempotencyKey}`;
    const now=this.options.now();
    const job:PublicationJob={publicationJobId,packageId:pkg.packageId,contentItemId:pkg.contentItemId,mediaAssetIds:pkg.assets.map(a=>a.assetId),targetPlatform:pkg.targetPlatform,targetAccountId:pkg.targetAccountId,targetFormat:pkg.targetFormat,caption:pkg.caption,scheduledAt,timezone:input.timezone,generation:pkg.generation,idempotencyKey,packageFingerprint,packageSnapshot,provider:input.provider,attempts:[],status:scheduledAt?'READY_TO_SCHEDULE':'READY_TO_PUBLISH',activeAttemptId:null,externalPublicationId:null,createdAt:now,updatedAt:now,failure:null,evidence:null,metricsLinkageId:pkg.metricsLinkageId};
    const result=await this.options.store.apply({mutationId:`create:${publicationJobId}`,userId:this.options.userId,recordId:publicationJobId,kind:'audit',expectedVersion:null,payload:job as unknown as Record<string,unknown>,deleted:false,clientUpdatedAt:now});
    const persisted=payload(result.record!);if(persisted.packageSnapshot!==packageSnapshot)throw new Error('Approved publication package changed without a new generation');return persisted;
  }
  async get(jobId:string){const record=await this.options.store.read(this.options.userId,jobId);return record?payload(record):null;}
  async execute(jobId:string,pkg:PersonaContentPackage,ownerId:string):Promise<PublicationJob>{
    let current=await this.required(jobId);if(current.status==='PUBLISHED_CONFIRMED'||current.status==='CANCELLED')return current;
    if(current.packageId!==pkg.packageId||current.generation!==pkg.generation||current.packageSnapshot!==canonicalPackage(pkg))throw new Error('Publication package does not match approved job snapshot');
    if(current.status==='PUBLISHING'||current.status==='SCHEDULED')return this.reconcile(jobId);
    if(current.status==='FAILED'&&!current.failure?.retryable)return current;
    if(!['READY_TO_PUBLISH','READY_TO_SCHEDULE','FAILED'].includes(current.status))return current;
    const adapter=this.options.router.get(current.provider);let connection:PublicationConnectionState;try{connection=await adapter.getConnectionStatus(current.targetAccountId);}catch{return this.recordBlocked(current,failure('PROVIDER_UNAVAILABLE','Publisher connection is unavailable',true));}
    if(connection!=='CONNECTED')return this.recordBlocked(current,connectionFailure(connection));
    let validation:PackageValidation;try{validation=await adapter.validatePackage(pkg);}catch{return this.recordFailed(current,failure('MEDIA_INVALID','Provider could not validate the publication package',false));}if(!validation.valid)return this.recordFailed(current,safeFailure(validation.failure,'MEDIA_INVALID'));
    try{if(!(await adapter.canPublish(pkg)))return this.recordBlocked(current,failure('PROVIDER_UNAVAILABLE','Provider cannot publish this package',true));}catch{return this.recordBlocked(current,failure('PROVIDER_UNAVAILABLE','Provider availability check failed',true));}
    const claim=await this.claim(current,ownerId);if(!claim.claimed)return claim.job;
    current=claim.job;const attempt=current.attempts.at(-1)!;
    let submission:ProviderSubmission;
    try{submission=current.scheduledAt?await adapter.schedule({job:current,package:pkg,attemptId:attempt.attemptId}):await adapter.publishNow({job:current,package:pkg,attemptId:attempt.attemptId});}
    catch{submission={outcome:'UNKNOWN',providerRequestId:null,evidence:null,failure:failure('UNKNOWN','Provider response unavailable; reconciliation required',true)};}
    return this.finishSubmission(current,attempt.attemptId,submission);
  }
  async reconcile(jobId:string):Promise<PublicationJob>{
    const current=await this.required(jobId);if(current.status==='PUBLISHED_CONFIRMED'||current.status==='CANCELLED')return current;
    if(!['PUBLISHING','SCHEDULED'].includes(current.status))return current;
    const adapter=this.options.router.get(current.provider);let status:ProviderStatus;try{status=await adapter.getPublicationStatus(current);}catch{return this.recordBlocked(current,failure('PROVIDER_UNAVAILABLE','Provider status is temporarily unavailable',true));}
    if(status.state==='PENDING')return current;
    if(status.state==='PUBLISHED'){let found=status.evidence;try{found=found??await adapter.getPublicationEvidence(current);}catch{return this.recordBlocked(current,failure('PROVIDER_UNAVAILABLE','Provider evidence is temporarily unavailable',true));}return this.confirm(current,found);}
    if(status.state==='FAILED')return this.recordFailed(current,safeFailure(status.failure,'PROVIDER_REJECTED'));
    if(status.state==='ABSENT_RETRY_SAFE')return this.releaseUnknown(current);
    return current;
  }
  async cancel(jobId:string):Promise<PublicationJob>{const record=await this.record(jobId),current=payload(record);if(current.status==='PUBLISHED_CONFIRMED')return current;const localOnly=current.attempts.length===0&&['DRAFT','READY_TO_PUBLISH','READY_TO_SCHEDULE'].includes(current.status);let cancelled=localOnly;if(!localOnly)try{cancelled=await this.options.router.get(current.provider).cancel(current);}catch{cancelled=false;}const latest=await this.record(jobId);if(latest.version!==record.version)return payload(latest);const next=cancelled?{...current,status:'CANCELLED' as const,activeAttemptId:null,failure:null,updatedAt:this.options.now()}:{...current,failure:failure('UNKNOWN','Provider cancellation is unconfirmed; reconciliation required',true),updatedAt:this.options.now()};const result=await this.options.store.apply({mutationId:`cancel:${jobId}:${record.version}:${cancelled?'confirmed':'unknown'}`,userId:this.options.userId,recordId:jobId,kind:'audit',expectedVersion:record.version,payload:next as unknown as Record<string,unknown>,deleted:false,clientUpdatedAt:next.updatedAt});return payload(result.record!);}
  private async claim(current:PublicationJob,ownerId:string):Promise<{claimed:boolean;job:PublicationJob}>{
    const record=await this.record(current.publicationJobId);const ordinal=current.attempts.length+1;const attemptId=`${current.publicationJobId}:attempt:${ordinal}`;const now=this.options.now();
    const next={...current,status:'PUBLISHING' as const,activeAttemptId:attemptId,updatedAt:now,failure:null,attempts:[...current.attempts,{attemptId,ordinal,ownerId,status:'STARTED' as const,providerRequestId:null,startedAt:now,finishedAt:null,failure:null}]};
    const result=await this.options.store.apply({mutationId:`claim:${attemptId}`,userId:this.options.userId,recordId:current.publicationJobId,kind:'audit',expectedVersion:record.version,payload:next as unknown as Record<string,unknown>,deleted:false,clientUpdatedAt:now});
    return result.status==='applied'?{claimed:true,job:payload(result.record!)}:{claimed:false,job:payload(result.record!)};
  }
  private async finishSubmission(current:PublicationJob,attemptId:string,submission:ProviderSubmission){
    if(submission.outcome==='CONFIRMED')return this.confirm(current,submission.evidence,attemptId);
    if(submission.outcome==='REJECTED')return this.recordFailed(current,safeFailure(submission.failure,'PROVIDER_REJECTED'),attemptId);
    return this.updateIfActive(current,attemptId,job=>({...job,status:job.scheduledAt&&submission.outcome==='ACCEPTED'?'SCHEDULED':'PUBLISHING',updatedAt:this.options.now(),activeAttemptId:attemptId,attempts:updateAttempt(job.attempts,attemptId,{status:submission.outcome==='ACCEPTED'?'ACCEPTED':'UNKNOWN',providerRequestId:submission.providerRequestId,failure:submission.failure?safeFailure(submission.failure,'UNKNOWN'):null})}));
  }
  private async confirm(current:PublicationJob,evidence:PublicationEvidence|null,attemptId=current.activeAttemptId){if(!evidence||!validEvidence(current,evidence))return this.recordFailed(current,failure('PROVIDER_REJECTED','Publication evidence does not match the canonical job',false),attemptId);return this.updateIfActive(current,attemptId,job=>({...job,status:'PUBLISHED_CONFIRMED',activeAttemptId:null,externalPublicationId:evidence.providerPublicationId,evidence,failure:null,updatedAt:this.options.now(),attempts:attemptId?updateAttempt(job.attempts,attemptId,{status:'CONFIRMED',finishedAt:this.options.now()}):job.attempts}));}
  private async releaseUnknown(current:PublicationJob){return this.update(current,job=>({...job,status:job.scheduledAt?'READY_TO_SCHEDULE':'READY_TO_PUBLISH',activeAttemptId:null,updatedAt:this.options.now(),attempts:job.activeAttemptId?updateAttempt(job.attempts,job.activeAttemptId,{status:'FAILED',finishedAt:this.options.now(),failure:failure('UNKNOWN','Provider has no matching publication; retry is safe',true)}):job.attempts}));}
  private async recordBlocked(current:PublicationJob,f:PublicationFailure){return this.update(current,job=>({...job,failure:f,updatedAt:this.options.now()}));}
  private async recordFailed(current:PublicationJob,f:PublicationFailure,attemptId=current.activeAttemptId){return this.updateIfActive(current,attemptId,job=>({...job,status:'FAILED',activeAttemptId:null,failure:f,updatedAt:this.options.now(),attempts:attemptId?updateAttempt(job.attempts,attemptId,{status:'FAILED',finishedAt:this.options.now(),failure:f}):job.attempts}));}
  private async updateIfActive(current:PublicationJob,attemptId:string|null,fn:(job:PublicationJob)=>PublicationJob){const latest=await this.required(current.publicationJobId);if(attemptId&&latest.activeAttemptId!==attemptId)return latest;return this.update(latest,fn);}
  private async update(current:PublicationJob,fn:(job:PublicationJob)=>PublicationJob){const record=await this.record(current.publicationJobId);const next=fn(payload(record));const result=await this.options.store.apply({mutationId:`update:${next.publicationJobId}:${record.version}:${next.updatedAt}:${next.status}`,userId:this.options.userId,recordId:next.publicationJobId,kind:'audit',expectedVersion:record.version,payload:next as unknown as Record<string,unknown>,deleted:false,clientUpdatedAt:next.updatedAt});return payload(result.record!);}
  private async record(id:string){const record=await this.options.store.read(this.options.userId,id);if(!record)throw new Error(`Publication job not found: ${id}`);return record;}
  private async required(id:string){return payload(await this.record(id));}
}

export function validateInstagramPackage(pkg:PersonaContentPackage):PackageValidation{
  if(pkg.targetPlatform!=='instagram')return {valid:false,failure:failure('MEDIA_INVALID','Publisher V1 supports Instagram packages only',false)};
  if(!pkg.targetAccountId.trim()||!pkg.packageId.trim()||!Number.isInteger(pkg.generation)||pkg.generation<1)return {valid:false,failure:failure('MEDIA_INVALID','Package identity is incomplete',false)};
  const validAssets=pkg.assets.every(a=>a.mediaType==='image'&&a.assetId.trim()!==''&&/^image\/(jpeg|png|webp)$/i.test(a.mimeType)&&isHttpsUrl(a.url));
  const uniqueAssets=new Set(pkg.assets.map(a=>a.assetId)).size===pkg.assets.length;
  if(pkg.targetFormat==='photo_post'&&pkg.assets.length===1&&validAssets)return {valid:true,failure:null};
  if(pkg.targetFormat==='carousel_post'&&pkg.assets.length>=2&&pkg.assets.length<=10&&validAssets&&uniqueAssets)return {valid:true,failure:null};
  return {valid:false,failure:failure('MEDIA_INVALID',pkg.targetFormat==='carousel_post'?'Instagram carousel requires 2-10 images':'Invalid media for publication format',false)};
}
export function manualPublicationAction(kind:'export'|'share'|'open_app'):PublicationAction{return kind==='export'?'MANUAL_EXPORT':kind==='share'?'SHARE_SHEET':'OPEN_EXTERNAL_APP';}
export function liveMetricoolReadiness(adapter:MetricoolPublisherAdapter,accountId:string){return adapter.getConnectionStatus(accountId);}

function payload(record:RuntimeRecord):PublicationJob{return JSON.parse(JSON.stringify(record.payload)) as PublicationJob;}
function failure(code:PublicationFailureCode,message:string,retryable:boolean):PublicationFailure{return {code,message,retryable};}
function disconnectedSubmission():ProviderSubmission{return {outcome:'REJECTED',providerRequestId:null,evidence:null,failure:failure('ACCOUNT_DISCONNECTED','EXTERNAL_CONNECTION_PENDING',false)};}
function connectionFailure(state:PublicationConnectionState){if(state==='AUTH_EXPIRED')return failure('AUTH_EXPIRED','Publisher authorization expired',false);if(state==='DISCONNECTED')return failure('ACCOUNT_DISCONNECTED','Publisher account is disconnected',false);return failure('PROVIDER_UNAVAILABLE',`Publisher connection is ${state.toLowerCase()}`,true);}
function updateAttempt(attempts:PublicationAttempt[],id:string,patch:Partial<PublicationAttempt>){return attempts.map(a=>a.attemptId===id?{...a,...patch}:a);}
function validEvidence(job:PublicationJob,e:PublicationEvidence){return e.provider===job.provider&&e.publicationJobId===job.publicationJobId&&e.idempotencyKey===job.idempotencyKey&&e.generation===job.generation&&e.packageFingerprint===job.packageFingerprint&&e.targetPlatform===job.targetPlatform&&e.targetAccountId===job.targetAccountId&&e.remoteState==='PUBLISHED'&&!!e.providerPublicationId&&Number.isFinite(Date.parse(e.publishedAt));}
function isHttpsUrl(value:string){try{return new URL(value).protocol==='https:';}catch{return false;}}
function nowMs(value:string){const parsed=Date.parse(value);if(!Number.isFinite(parsed))throw new Error('Invalid clock');return parsed;}
function validateSchedule(scheduledAt:string|null,timezone:string,now:number){try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(0);}catch{throw new Error('SCHEDULE_INVALID: invalid IANA timezone');}if(!scheduledAt)return;const at=Date.parse(scheduledAt);if(!Number.isFinite(at)||at<=now)throw new Error('SCHEDULE_INVALID: publication time must be in the future');}
function canonicalPackage(pkg:PersonaContentPackage){return JSON.stringify({packageId:pkg.packageId,contentItemId:pkg.contentItemId,candidateId:pkg.candidateId,generation:pkg.generation,approval:{approvalId:pkg.approval.approvalId,candidateId:pkg.approval.candidateId,revision:pkg.approval.revision,decidedAt:pkg.approval.decidedAt},assets:pkg.assets.map(a=>({assetId:a.assetId,mediaType:a.mediaType,url:a.url,mimeType:a.mimeType})),targetPlatform:pkg.targetPlatform,targetAccountId:pkg.targetAccountId,targetFormat:pkg.targetFormat,caption:pkg.caption,metricsLinkageId:pkg.metricsLinkageId});}
function fingerprintPackage(canonical:string){let hash=0x811c9dc5;for(let i=0;i<canonical.length;i++){hash^=canonical.charCodeAt(i);hash=Math.imul(hash,0x01000193)>>>0;}return `display-fnv1a-${hash.toString(16).padStart(8,'0')}`;}
function safeFailure(value:PublicationFailure|null|undefined,fallback:PublicationFailureCode):PublicationFailure{const code=value?.code??fallback;const retryable=['PROVIDER_UNAVAILABLE','RATE_LIMITED','UNKNOWN'].includes(code);const messages:Record<PublicationFailureCode,string>={ACCOUNT_DISCONNECTED:'Publisher account is disconnected',AUTH_EXPIRED:'Publisher authorization expired',PROVIDER_UNAVAILABLE:'Publication provider is unavailable',PROVIDER_REJECTED:'Publication provider rejected the request',MEDIA_INVALID:'Publication media is invalid',RATE_LIMITED:'Publication provider rate limit reached',SCHEDULE_INVALID:'Publication schedule is invalid',DUPLICATE_PREVENTED:'Duplicate publication was prevented',UNKNOWN:'Publication result is unknown; reconciliation required'};return{code,message:messages[code],retryable};}

