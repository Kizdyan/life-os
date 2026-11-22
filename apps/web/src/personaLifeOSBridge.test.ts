import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFridgeHumV2} from './personaEditorialV2';
import {reviseEditorialPost,approveEditorialStep,setEditorialPublicCopyReviewed,
 setEditorialSourceReviewed,setEditorialChecklistItem} from './personaEditorialModel';
import {applyLocalOutcome,applyLocalPlan,readLocalToday,type StorageLike} from './localRuntime';
import {planLocalDateTime} from './planner';
import {createLocalPersonaLifeOSPort,readPersonaErikaStatus,schedulePersonaAuthorReview,
 readPersonaCalendarDay,formatPersonaReviewInterval} from './personaLifeOSBridge';
import type {Item} from './types';

const roots:string[]=[];
function fixture(){
 const root=mkdtempSync(join(tmpdir(),'persona-lifeos-bridge-'));roots.push(root);
 const file=join(root,'runtime.json');
 const storage:StorageLike={getItem:()=>existsSync(file)?readFileSync(file,'utf8'):null,
  setItem:(_key,value)=>writeFileSync(file,value)};
 let id=0;const createId=()=>`task-${++id}`;
 return {storage,port:createLocalPersonaLifeOSPort(storage,createId),post:createFridgeHumV2(),createId};
}
afterEach(()=>roots.splice(0).forEach(root=>rmSync(root,{recursive:true,force:true})));
const slot={date:'2026-11-26',time:'18:00'};

describe('Persona → existing Life OS runtime → exact-ID Erika status',()=>{
 it('persists a real local review task and reads it after reconstructing the adapter',async()=>{
  const f=fixture(),before=JSON.stringify(f.post);
  const result=await schedulePersonaAuthorReview(f.post,slot,f.port);
  expect(result.status).toBe('VERIFIED');
  expect(result.provenance).toBe('LOCAL_RUNTIME');
  expect(result.observation?.state).toBe('verified');
  expect(readLocalToday(f.storage,slot.date)).toHaveLength(1);
  const fresh=createLocalPersonaLifeOSPort(f.storage,f.createId);
  const status=await readPersonaErikaStatus(f.post.id,[f.post],slot.date,fresh);
  expect(status.status).toBe('VERIFIED');
  expect(status.contentId).toBe(f.post.id);
  expect(status.tasks?.[0].id).toBe(result.task?.id);
  expect(status.contentApproval).toBe('NEEDS_AUTHOR_REVIEW');
  expect(status.visualApproval).toBe('NEEDS_AUTHOR_REVIEW');
  expect(status.diveM).toBe('NOT_CONNECTED');
  expect(status.published).toBe('UNVERIFIED');
  expect(JSON.stringify(f.post)).toBe(before);
 });
 it('repeats and changed content revisions do not create duplicate review tasks',async()=>{
  const f=fixture();
  await schedulePersonaAuthorReview(f.post,slot,f.port);
  const changed=reviseEditorialPost(f.post,{caption:f.post.caption+' Новая редакция.'});
  const result=await schedulePersonaAuthorReview(changed,slot,f.port);
  expect(result.status).toBe('VERIFIED');expect(result.replayed).toBe(true);
  expect(readLocalToday(f.storage,slot.date)).toHaveLength(1);
 });
 it('task completion does not approve content or prove publication',async()=>{
  const f=fixture();await schedulePersonaAuthorReview(f.post,slot,f.port);
  applyLocalOutcome(f.storage,readLocalToday(f.storage,slot.date)[0],'complete',f.createId);
  const result=await readPersonaErikaStatus(f.post.id,[f.post],slot.date,f.port);
  expect(result.tasks?.[0].status).toBe('completed');
  expect(result.contentApproval).toBe('NEEDS_AUTHOR_REVIEW');
  expect(result.visualApproval).toBe('NEEDS_AUTHOR_REVIEW');
  expect(result.published).toBe('UNVERIFIED');
 });
 it('conflicts preserve other tasks and do not claim review scheduling succeeded',async()=>{
  const f=fixture();
  applyLocalPlan(f.storage,'other',[{title:'Другая задача',planned_start:planLocalDateTime(slot.date,'18:00'),planned_end:planLocalDateTime(slot.date,'18:20')}],f.createId);
  const saved=f.storage.getItem('');
  const result=await schedulePersonaAuthorReview(f.post,slot,f.port);
  expect(result.status).toBe('UNAVAILABLE');expect(f.storage.getItem('')).toBe(saved);
 });
 it('missing storage or failed readback never returns success',async()=>{
  const f=fixture();
  const broken=createLocalPersonaLifeOSPort({getItem:()=>null,setItem:()=>{throw Error('storage unavailable')}},f.createId);
  expect((await schedulePersonaAuthorReview(f.post,slot,broken)).status).toBe('UNAVAILABLE');
  const failedRead={...f.port,readDay:async()=>{throw Error('readback unavailable')}};
  const result=await schedulePersonaAuthorReview(f.post,slot,failedRead);
  expect(result.status).toBe('UNAVAILABLE');expect(result.writeMayHaveSucceeded).toBe(true);
  expect(readLocalToday(f.storage,slot.date)).toHaveLength(1);
 });
 it('Erika reads the exact content ID only and never writes',async()=>{
  const f=fixture();await schedulePersonaAuthorReview(f.post,slot,f.port);
  const before=f.storage.getItem('');
  expect((await readPersonaErikaStatus('carousel-fridge-hum',[f.post],slot.date,f.port)).status).toBe('NOT_FOUND');
  expect((await readPersonaErikaStatus(f.post.id,[f.post],slot.date,f.port)).policy?.level).toBe('auto');
  expect(f.storage.getItem('')).toBe(before);
 });
 it('does not silently move an existing review when another time is requested',async()=>{
  const f=fixture();await schedulePersonaAuthorReview(f.post,slot,f.port);
  const result=await schedulePersonaAuthorReview(f.post,{...slot,time:'19:00'},f.port);
  expect(result.status).toBe('VERIFIED');expect(result.replayed).toBe(true);
  expect(result.task?.planned_start?.slice(11,16)).toBe('18:00');
  expect(readLocalToday(f.storage,slot.date)).toHaveLength(1);
 });
 it('reports actual approval records, then invalidates them after a content edit',async()=>{
  const f=fixture();let reviewed=f.post;
  for(const source of reviewed.research!.sourceItems)
   reviewed=setEditorialSourceReviewed(reviewed,source.slideId,source.url,true);
  reviewed=setEditorialPublicCopyReviewed(reviewed,true);
  reviewed=approveEditorialStep(approveEditorialStep(reviewed,'topic'),'content');
  // Synthetic author approval record only; never written to an author store.
  for(let i=0;i<6;i++)reviewed=setEditorialChecklistItem(reviewed,i,true);
  reviewed=approveEditorialStep(reviewed,'design');
  const accepted=await readPersonaErikaStatus(reviewed.id,[reviewed],slot.date,f.port);
  expect(accepted.contentApproval).toBe('AUTHOR_APPROVAL_RECORDED');
  expect(accepted.visualApproval).toBe('AUTHOR_APPROVAL_RECORDED');
  expect(accepted.sourceReview).toBe('MANUAL_REVIEW_RECORDED');
  const revised=reviseEditorialPost(reviewed,{caption:reviewed.caption+' Новое утверждение.'});
  const changed=await readPersonaErikaStatus(revised.id,[revised],slot.date,f.port);
  expect(changed.sourceReview).toBe('UNVERIFIED');
  expect(changed.contentApproval).toBe('NEEDS_AUTHOR_REVIEW');
  expect(changed.visualApproval).toBe('NEEDS_AUTHOR_REVIEW');
 });
 it('invalid dates and late times cannot write; corrupt existing data remains intact',async()=>{
  const f=fixture();
  for(const invalid of [{date:'2026-02-30',time:'18:00'},{date:slot.date,time:'23:50'},{date:slot.date,time:'99:00'}])
   expect((await schedulePersonaAuthorReview(f.post,invalid,f.port)).status).toBe('UNAVAILABLE');
  expect(f.storage.getItem('')).toBe(null);
  f.storage.setItem('','corrupt author data');
  expect((await schedulePersonaAuthorReview(f.post,slot,f.port)).status).toBe('UNAVAILABLE');
  expect(f.storage.getItem('')).toBe('corrupt author data');
 });
 it('unavailable cloud transport has no local fallback or false connected claim',async()=>{
  const f=fixture();
  const offline={provenance:'SUPABASE_RUNTIME' as const,
   applyPlan:async()=>{throw Error('cloud unavailable')},readDay:async()=>{throw Error('cloud unavailable')}};
  const result=await schedulePersonaAuthorReview(f.post,slot,offline);
  expect(result.status).toBe('UNAVAILABLE');expect(result.provenance).toBe('SUPABASE_RUNTIME');
  const status=await readPersonaErikaStatus(f.post.id,[f.post],slot.date,offline);
  expect(status.status).toBe('UNAVAILABLE');expect(status.diveM).toBe('NOT_CONNECTED');
  expect(f.storage.getItem('')).toBe(null);
 });
 it('uses local Moscow date across the UTC midnight boundary in cloud calendar serialization',async()=>{
  // Serialized timestamp contract fixture, not a live cloud or HTTP success claim.
  const early:Item={id:'early',title:'Просмотр',kind:'persona-review:fixture',status:'planned',
   planned_start:'2026-11-25T22:00:00+00:00',planned_end:'2026-11-25T22:20:00+00:00'};
  const outside:Item={...early,id:'other-day',planned_start:'2026-11-26T22:00:00Z'};
  const days:string[]=[];
  const tasks=await readPersonaCalendarDay(slot.date,{provenance:'SUPABASE_RUNTIME',
   applyPlan:async()=>{throw Error('No cloud write allowed')},readDay:async date=>{
    days.push(date);return [early,early,outside].filter(x=>x.planned_start!.slice(0,10)===date);
   }},'Europe/Moscow');
  expect(days.sort()).toEqual(['2026-11-25','2026-11-26','2026-11-27']);
  expect(tasks.map(x=>x.id)).toEqual(['early']);
  expect(formatPersonaReviewInterval(early,'Europe/Moscow')).toBe('2026-11-26 01:00–01:20');
 });
 it('shows a UTC-serialized 18:00 Moscow review as 18:00, not 15:00',()=>{
  const task:Item={id:'evening',title:'Просмотр',kind:'persona-review:fixture',status:'planned',
   planned_start:'2026-11-26T15:00:00Z',planned_end:'2026-11-26T15:20:00Z'};
  expect(formatPersonaReviewInterval(task,'Europe/Moscow')).toBe('2026-11-26 18:00–18:20');
  expect(formatPersonaReviewInterval({...task,planned_start:'invalid'},'Europe/Moscow')).toBe('Время не подтверждено');
 });
 it('a failed neighboring day read refuses a partial cloud calendar success',async()=>{
  await expect(readPersonaCalendarDay(slot.date,{provenance:'SUPABASE_RUNTIME',
   applyPlan:async()=>{throw Error('No cloud write allowed')},readDay:async date=>{
    if(date==='2026-11-25')throw Error('neighbor unavailable');return [];
   }},'Europe/Moscow')).rejects.toThrow('neighbor unavailable');
 });
 it.each(['01:00','18:00'])('verifies a %s task after UTC serialization without changing its local time',async time=>{
  const f=fixture();
  // Real local persistence + PostgreSQL-style UTC serialization fixture only.
  // This does not call or prove a connected cloud service.
  const serialized={...f.port,provenance:'SUPABASE_RUNTIME' as const,readDay:async(date:string)=>
   readLocalToday(f.storage,slot.date).map(task=>({...task,
    planned_start:new Date(task.planned_start!).toISOString(),
    planned_end:new Date(task.planned_end!).toISOString()}))
    .filter(task=>task.planned_start.slice(0,10)===date)};
  const result=await schedulePersonaAuthorReview(f.post,{...slot,time},serialized);
  expect(result.status).toBe('VERIFIED');
  expect(formatPersonaReviewInterval(result.task!)).toBe(`${slot.date} ${time}–${time.slice(0,3)}20`);
  const status=await readPersonaErikaStatus(f.post.id,[f.post],slot.date,serialized);
  expect(status.tasks?.[0].id).toBe(result.task?.id);
  expect(status.published).toBe('UNVERIFIED');
 });
});
