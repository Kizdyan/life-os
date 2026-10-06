import type { MediaAsset, MediaProject, StyleMemoryObservation } from "./media-brain";
import type { MediaAssetStore } from "./media-ingestion";
import type { MediaJob, MediaJobStore } from "./media-jobs";
import type { MediaProjectStore } from "./media-projects";
import type { StyleMemoryStore } from "./style-memory";
import type { AudiencePerformanceSignal, AudiencePerformanceStore } from "./media-analytics";
import type { MediaCandidateRecord, MediaCandidateStore } from "./media-candidate-store";
import type { PersonaApprovalRecord, PersonaLearningSignal, PersonaMemoryRule, PersonaMetricSnapshot, PersonaPublicationJob } from "./persona-state";

export interface KeyValueStore { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; }

export interface MediaStateSnapshot {
  schemaVersion: 1; revision: number;
  assetsByIngestKey: Record<string, MediaAsset>; jobsById: Record<string, MediaJob>;
  projectsByKey: Record<string, MediaProject>; candidatesById: Record<string, MediaCandidateRecord>;
  latestCandidateIdByProject: Record<string, string>; styleObservations: StyleMemoryObservation[];
  audienceSignals: AudiencePerformanceSignal[];
  personaApprovalsByCandidate: Record<string, PersonaApprovalRecord>;
  personaPublicationJobsById: Record<string, PersonaPublicationJob>;
  personaMetricSnapshots: PersonaMetricSnapshot[];
  personaLearningSignals: PersonaLearningSignal[];
  personaMemoryRulesById: Record<string, PersonaMemoryRule>;
  updatedAt: string;
}
export interface MediaStateStoreOptions { kv: KeyValueStore; key?: string; now: () => string; }

export class MediaStateStore implements MediaAssetStore, MediaJobStore, MediaProjectStore, MediaCandidateStore, StyleMemoryStore, AudiencePerformanceStore {
  private readonly key: string; private queue: Promise<void> = Promise.resolve();
  constructor(private readonly options: MediaStateStoreOptions) { this.key = options.key ?? "lifeos:media-brain:v1"; }
  async findByIngestKey(key: string) { return (await this.read()).assetsByIngestKey[key] ?? null; }
  async save(asset: MediaAsset, ingestKey: string): Promise<void>;
  async save(job: MediaJob): Promise<void>;
  async save(project: MediaProject, key: string): Promise<void>;
  async save(value: MediaAsset | MediaJob | MediaProject, key?: string): Promise<void> {
    if (isMediaJob(value)) return this.update(s => { s.jobsById[value.id] = clone(value); });
    if (isMediaProject(value)) { if (!key) throw new Error("Project store key is required"); return this.update(s => { s.projectsByKey[key] = clone(value); }); }
    if (!key) throw new Error("Asset ingest key is required"); return this.update(s => { s.assetsByIngestKey[key] = clone(value); });
  }
  async enqueue(job: MediaJob) { await this.update(s => { if (s.jobsById[job.id]) throw new Error(`Media job already exists: ${job.id}`); s.jobsById[job.id] = clone(job); }); }
  async get(jobId: string) { return (await this.read()).jobsById[jobId] ?? null; }
  async listRunnable(now: string, limit: number) { return Object.values((await this.read()).jobsById).filter(j => j.state === "queued" || j.state === "failed").filter(j => !j.notBefore || j.notBefore <= now).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id)).slice(0,Math.max(0,limit)); }
  async findActiveByKey(key: string) { const p=(await this.read()).projectsByKey[key]; return !p || ["archived","published","rejected"].includes(p.status) ? null : p; }
  async saveCandidate(record: MediaCandidateRecord) { const id=record.candidate.id.trim(), projectId=record.candidate.projectId.trim(); if(!id) throw new Error("Media candidate id is required"); if(!projectId) throw new Error("Media candidate projectId is required"); await this.update(s=>{s.candidatesById[id]=clone(record);s.latestCandidateIdByProject[projectId]=id;}); }
  async getCandidateRecord(id:string){const r=(await this.read()).candidatesById[id];return r?clone(r):null;}
  async getLatestCandidateForProject(projectId:string){const s=await this.read(),id=s.latestCandidateIdByProject[projectId];const r=id?s.candidatesById[id]:undefined;return r?clone(r):null;}
  async append(value: StyleMemoryObservation | AudiencePerformanceSignal) { if(isAudiencePerformanceSignal(value)) return this.update(s=>{s.audienceSignals.push(clone(value));}); return this.update(s=>{s.styleObservations.push(clone(value));}); }
  async listByDimension(d:StyleMemoryObservation["dimension"]){return (await this.read()).styleObservations.filter(x=>x.dimension===d).map(clone);}
  async listByCandidate(id:string){return (await this.read()).audienceSignals.filter(x=>x.candidateId===id).map(clone);}
  async savePersonaApproval(value: PersonaApprovalRecord){await this.update(s=>{s.personaApprovalsByCandidate[value.candidateId]=clone(value);});}
  async savePersonaPublicationJob(value: PersonaPublicationJob){await this.update(s=>{s.personaPublicationJobsById[value.id]=clone(value);});}
  async appendPersonaMetric(value: PersonaMetricSnapshot){await this.update(s=>{s.personaMetricSnapshots.push(clone(value));});}
  async appendPersonaLearningSignal(value: PersonaLearningSignal){await this.update(s=>{s.personaLearningSignals.push(clone(value));});}
  async savePersonaMemoryRule(value: PersonaMemoryRule){const id=value.id.trim(),rule=value.rule.trim();if(!id)throw new Error("Persona memory rule id is required");if(!rule)throw new Error("Persona memory rule is required");const normalized={...value,id,rule};await this.update(s=>{const current=s.personaMemoryRulesById[id];if(current?.source==="explicit"&&normalized.source==="inferred")return;s.personaMemoryRulesById[id]=clone(normalized);});}
  async listPersonaMemoryRules(){return Object.values((await this.read()).personaMemoryRulesById).map(clone).sort((a,b)=>a.id.localeCompare(b.id));}
  async snapshot(){return this.read();}
  private async read():Promise<MediaStateSnapshot>{const raw=await this.options.kv.get(this.key);if(!raw)return emptyState(this.options.now());const p=JSON.parse(raw) as Partial<MediaStateSnapshot>;if(p.schemaVersion!==1)throw new Error("Unsupported Media Brain state schema");return {schemaVersion:1,revision:finiteInteger(p.revision,0),assetsByIngestKey:p.assetsByIngestKey??{},jobsById:p.jobsById??{},projectsByKey:p.projectsByKey??{},candidatesById:p.candidatesById??{},latestCandidateIdByProject:p.latestCandidateIdByProject??{},styleObservations:p.styleObservations??[],audienceSignals:p.audienceSignals??[],personaApprovalsByCandidate:p.personaApprovalsByCandidate??{},personaPublicationJobsById:p.personaPublicationJobsById??{},personaMetricSnapshots:p.personaMetricSnapshots??[],personaLearningSignals:p.personaLearningSignals??[],personaMemoryRulesById:p.personaMemoryRulesById??{},updatedAt:typeof p.updatedAt==="string"?p.updatedAt:this.options.now()};}
  private async update(m:(s:MediaStateSnapshot)=>void){const op=this.queue.catch(()=>undefined).then(async()=>{const s=await this.read();m(s);s.revision+=1;s.updatedAt=this.options.now();await this.options.kv.set(this.key,JSON.stringify(s));});this.queue=op.catch(()=>undefined);await op;}
}
function emptyState(now:string):MediaStateSnapshot{return {schemaVersion:1,revision:0,assetsByIngestKey:{},jobsById:{},projectsByKey:{},candidatesById:{},latestCandidateIdByProject:{},styleObservations:[],audienceSignals:[],personaApprovalsByCandidate:{},personaPublicationJobsById:{},personaMetricSnapshots:[],personaLearningSignals:[],personaMemoryRulesById:{},updatedAt:now};}
function isMediaJob(v:MediaAsset|MediaJob|MediaProject):v is MediaJob{return "type" in v&&"maxAttempts" in v&&"dependsOnJobId" in v;}
function isMediaProject(v:MediaAsset|MediaJob|MediaProject):v is MediaProject{return "assetIds" in v&&"channelTargets" in v;}
function isAudiencePerformanceSignal(v:StyleMemoryObservation|AudiencePerformanceSignal):v is AudiencePerformanceSignal{return "rates" in v&&"raw" in v;}
function finiteInteger(v:unknown,f:number){return typeof v==="number"&&Number.isFinite(v)&&Number.isInteger(v)?v:f;}
function clone<T>(v:T):T{return JSON.parse(JSON.stringify(v)) as T;}
