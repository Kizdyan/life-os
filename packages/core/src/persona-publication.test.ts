import { describe, expect, it } from 'vitest';
import { createPersonaPublicationJobs, publishPersonaJob, type PersonaPublisher } from './persona-publication';
import type { PersonaApprovalRecord, PersonaPlatformVariant, PersonaPublicationJob } from './persona-state';

const approval: PersonaApprovalRecord={candidateId:'c1',revision:2,decision:'approved',reason:null,decidedAt:'2026-10-04T12:00:00Z'};
const variants: PersonaPlatformVariant[]=[
 {id:'v1',candidateId:'c1',revision:2,platform:'instagram',mediaAssetId:'a1',title:null,caption:'one',coverAssetId:null,createdAt:'2026-10-04T12:01:00Z'},
 {id:'v2',candidateId:'c1',revision:2,platform:'youtube',mediaAssetId:'a1',title:'one',caption:null,coverAssetId:null,createdAt:'2026-10-04T12:01:00Z'},
];

describe('Persona publication queue',()=>{
 it('creates independent platform jobs only after explicit approval',()=>{
  expect(()=>createPersonaPublicationJobs(null,variants,'2026-10-04T12:02:00Z')).toThrow('approval');
  const jobs=createPersonaPublicationJobs(approval,variants,'2026-10-04T12:02:00Z');
  expect(jobs.map(x=>x.platform)).toEqual(['instagram','youtube']);
  expect(new Set(jobs.map(x=>x.idempotencyKey)).size).toBe(2);
 });
 it('verifies before publishing and does not duplicate an already-created external post',async()=>{
  const job=createPersonaPublicationJobs(approval,[variants[0]],'2026-10-04T12:02:00Z')[0];let publishes=0;
  const publisher:PersonaPublisher={platform:'instagram',async verify(){return{found:true,externalId:'ig-1',externalUrl:'https://instagram.com/p/ig-1'}},async publish(){publishes++;return{externalId:'ig-new',externalUrl:null}}};
  const result=await publishPersonaJob(job,variants[0],publisher,'2026-10-04T12:03:00Z');
  expect(result.state).toBe('verified');expect(result.externalId).toBe('ig-1');expect(publishes).toBe(0);
 });
 it('marks an uncertain publish for verification instead of blind retry',async()=>{
  const job=createPersonaPublicationJobs(approval,[variants[0]],'2026-10-04T12:02:00Z')[0];
  const publisher:PersonaPublisher={platform:'instagram',async verify(){return{found:false,externalId:null,externalUrl:null}},async publish(){throw new Error('response_lost')}};
  const result=await publishPersonaJob(job,variants[0],publisher,'2026-10-04T12:03:00Z');
  expect(result.state).toBe('retry_wait');expect(result.attempts).toBe(1);expect(result.lastError).toContain('response_lost');
 });
});
