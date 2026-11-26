import {decideAutonomy} from '../../../packages/core/src/policy';
import {observe} from '../../../packages/core/src/observer';
import type {ActionRequest,Observation,PolicyDecision} from '../../../packages/core/src/types';
import {applyLocalPlan,readLocalToday,type StorageLike} from './localRuntime';
import {planLocalDateTime} from './planner';
import {editorialContentHash,editorialTextHash,editorialSourcesPass,publicationDesignApproved,
 validatePost,type EditorialPost} from './personaEditorialModel';
import type {PlanInput} from './api';
import type {Item} from './types';

/** Adapter over existing task stores. No content copy, task DB or publication operation. */
export interface PersonaLifeOSPort {
 provenance:'LOCAL_RUNTIME'|'SUPABASE_RUNTIME';
 applyPlan(key:string,items:PlanInput[]):Promise<{applied:boolean;ids:string[];replayed:boolean}>;
 readDay(date:string):Promise<Item[]>;
}
export function createLocalPersonaLifeOSPort(storage:StorageLike,createId:()=>string):PersonaLifeOSPort{
 return {provenance:'LOCAL_RUNTIME',
  applyPlan:async(key,items)=>applyLocalPlan(storage,key,items,createId),
  readDay:async date=>readLocalToday(storage,date)};
}
const reviewKind=(id:string)=>'persona-review:'+id;
function localInstant(value:string|null,timeZone?:string):{date:string;time:string}|null{
 if(!value||!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)||!Number.isFinite(Date.parse(value)))return null;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const get=(key:Intl.DateTimeFormatPartTypes)=>parts.find(part=>part.type===key)!.value;
 return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
/** Existing cloud API uses UTC day windows. Read adjacent windows too, then
 * compare instants in the browser calendar. All three reads must succeed.
 * Local runtime already selects its saved local day and needs only one read.
 */
export async function readPersonaCalendarDay(date:string,port:PersonaLifeOSPort,timeZone?:string):Promise<Item[]>{
 validDate(date);
 const shift=(offset:number)=>{
  const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+offset);
  return value.toISOString().slice(0,10);
 };
 const days=port.provenance==='SUPABASE_RUNTIME'?[shift(-1),date,shift(1)]:[date];
 const windows=await Promise.all(days.map(day=>port.readDay(day)));
 const unique=new Map<string,Item>();
 for(const item of windows.flat())if(localInstant(item.planned_start,timeZone)?.date===date)unique.set(item.id,item);
 return [...unique.values()];
}
export function formatPersonaReviewInterval(task:Item,timeZone?:string):string{
 const start=localInstant(task.planned_start,timeZone),end=localInstant(task.planned_end,timeZone);
 if(!start||!end)return 'Время не подтверждено';
 return `${start.date} ${start.time}–${end.date===start.date?'':end.date+' '}${end.time}`;
}
function validDate(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||
  new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)throw Error('Проверь дату просмотра.');
}
function action(id:string,write:boolean,provenance:PersonaLifeOSPort['provenance']):ActionRequest{
 return {id:'persona-review:'+id,actionGroupId:id,tool:write?'lifeos.schedule-author-review':'erika.read-persona-status',
  input:{contentId:id},risks:write?(provenance==='LOCAL_RUNTIME'?['reversible']:['external']):['read_only'],
  reversible:write,idempotencyKey:'persona-review:'+id};
}
export type PersonaReviewResult={status:'VERIFIED'|'UNAVAILABLE';contentId:string;
 provenance:PersonaLifeOSPort['provenance'];policy?:PolicyDecision;observation?:Observation;
 task?:Item;replayed?:boolean;message:string;writeMayHaveSucceeded:boolean};

/** Explicit click only. One review task per content/date, independent of content revision.
 * A replay returns the saved time; it never silently moves an existing author task.
 */
export async function schedulePersonaAuthorReview(post:EditorialPost,slot:{date:string;time:string},port:PersonaLifeOSPort):Promise<PersonaReviewResult>{
 const base={contentId:post.id,provenance:port.provenance};
 let writeMayHaveSucceeded=false;
 try{
  validatePost(post);validDate(slot.date);
  if(!/^\d{2}:\d{2}$/.test(slot.time))throw Error('Проверь время просмотра.');
  const [hour,minute]=slot.time.split(':').map(Number),end=hour*60+minute+20;
  if(hour>23||minute>59||end>=24*60)throw Error('Нужен двадцатиминутный интервал в пределах дня.');
  const start=planLocalDateTime(slot.date,slot.time);
  const finish=planLocalDateTime(slot.date,`${String(Math.floor(end/60)).padStart(2,'0')}:${String(end%60).padStart(2,'0')}`);
  const request=action(post.id,true,port.provenance),policy=decideAutonomy(request);
  if(policy.level==='approval')throw Error('Для действия требуется отдельное разрешение.');
  // Includes content and day, not revision, caption, task title or requested time.
  const key=`persona:author-review:v1:${post.id}:${slot.date}`;
  writeMayHaveSucceeded=true;
  const saved=await port.applyPlan(key,[{title:`Авторский просмотр: ${post.title} [${post.id}]`,
   kind:reviewKind(post.id),planned_start:start,planned_end:finish,carry_forward:false}]);
  let task:Item|undefined;
  const observation=await observe(request,{verify:async()=>{
   const items=await readPersonaCalendarDay(slot.date,port);
   task=items.find(item=>saved.ids.length===1&&item.id===saved.ids[0]&&item.kind===reviewKind(post.id)&&
    localInstant(item.planned_start)?.date===slot.date&&Boolean(localInstant(item.planned_end)));
   if(!task)return {state:'uncertain',message:'Сохранение просмотра не подтверждено чтением расписания. Проверь этот день перед повтором.'};
   return {state:'verified',evidence:{contentId:post.id,taskId:task.id,date:slot.date,
    provenance:port.provenance,contentRevision:post.revision,contentHash:editorialContentHash(post),authorApprovalGranted:false}};
  }});
  if(observation.state!=='verified')return {...base,status:'UNAVAILABLE',policy,observation,
   writeMayHaveSucceeded,message:observation.message??'Не удалось проверить сохранение.'};
  return {...base,status:'VERIFIED',policy,observation,task,replayed:saved.replayed,writeMayHaveSucceeded,
   message:saved.replayed?'Просмотр уже есть в расписании. Сохранённое время не изменено.':'Авторский просмотр сохранён и проверен в расписании.'};
 }catch(error){return {...base,status:'UNAVAILABLE',writeMayHaveSucceeded,
  message:error instanceof Error?error.message:'Расписание недоступно.'};}
}

export type PersonaErikaStatus={status:'VERIFIED'|'NOT_FOUND'|'UNAVAILABLE';contentId:string;
 provenance:PersonaLifeOSPort['provenance'];message:string;policy?:PolicyDecision;observation?:Observation;
 revision?:number;tasks?:Item[];sourceReview?:'MANUAL_REVIEW_RECORDED'|'UNVERIFIED'|'NO_RESEARCH_EVIDENCE';
 contentApproval?:'AUTHOR_APPROVAL_RECORDED'|'NEEDS_AUTHOR_REVIEW';
 visualApproval?:'AUTHOR_APPROVAL_RECORDED'|'NEEDS_AUTHOR_REVIEW';
 technical?:'UNVERIFIED';published?:'UNVERIFIED';diveM:'NOT_CONNECTED'};

/** Read-only Erika projection; exact ID only, no fuzzy matching and no inferred PASS.
 * VERIFIED describes this readback, never artistic acceptance or publication.
 */
export async function readPersonaErikaStatus(contentId:string,posts:readonly EditorialPost[],date:string,port:PersonaLifeOSPort):Promise<PersonaErikaStatus>{
 const base={contentId,provenance:port.provenance,diveM:'NOT_CONNECTED' as const};
 const post=posts.find(p=>p.id===contentId);
 if(!post)return {...base,status:'NOT_FOUND',message:'Материал с этим точным ID не найден.'};
 try{
  validatePost(post);validDate(date);
  const request=action(contentId,false,port.provenance),policy=decideAutonomy(request);
  let tasks:Item[]=[];
  const observation=await observe(request,{verify:async()=>{
   tasks=(await readPersonaCalendarDay(date,port)).filter(item=>item.kind===reviewKind(contentId));
   return {state:'verified',evidence:{contentId,revision:post.revision,date,taskIds:tasks.map(t=>t.id),provenance:port.provenance}};
  }});
  if(observation.state!=='verified')return {...base,status:'UNAVAILABLE',policy,observation,
   message:observation.message??'Статус расписания недоступен.'};
  const contentApproved=post.approvals.content&&
   (post.approvals.textHashAtApproval===editorialTextHash(post)||post.approvals.contentHashAtApproval===editorialContentHash(post));
  return {...base,status:'VERIFIED',policy,observation,revision:post.revision,tasks,
   sourceReview:!post.research?'NO_RESEARCH_EVIDENCE':editorialSourcesPass(post)?'MANUAL_REVIEW_RECORDED':'UNVERIFIED',
   contentApproval:contentApproved?'AUTHOR_APPROVAL_RECORDED':'NEEDS_AUTHOR_REVIEW',
   visualApproval:publicationDesignApproved(post)?'AUTHOR_APPROVAL_RECORDED':'NEEDS_AUTHOR_REVIEW',
   technical:'UNVERIFIED',published:'UNVERIFIED',
   message:tasks.length?`Найдено задач просмотра на ${date}: ${tasks.length}.`:`На ${date} задача просмотра не найдена.`};
 }catch(error){return {...base,status:'UNAVAILABLE',message:error instanceof Error?error.message:'Статус недоступен.'};}
}
