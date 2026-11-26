import {editorialSourcesPass,publicationDesignApproved,type EditorialPost} from './personaEditorialModel';
import {independentEditorialGate} from './personaCarouselIndependentReview';
import {archiveMatchesPost,type ReviewArchiveEvidence} from './personaReviewArchive';
import {addCalendarDays} from './personaWeeklyContentCalendar';

/** Existing material/date projection only. Never count an approval as a file. */
export function editorialReserve(posts:readonly EditorialPost[],startDate:string,archives?:ReadonlyMap<string,ReviewArchiveEvidence>){
 const dates=Array.from({length:7},(_,i)=>addCalendarDays(startDate,i));
 const rows=dates.map(date=>{
  const materials=posts.filter(p=>p.scheduledDate===date).map(p=>{
   const blockers:string[]=[];
   if(p.kind!=='carousel')blockers.push('Другой формат: сохранить назначенную публикацию');
   if(!p.approvals.topic)blockers.push('Тема не утверждена');
   if(!p.caption.trim()||!p.approvals.content)blockers.push('Текст не утверждён');
   if(!p.research||!editorialSourcesPass(p))blockers.push('Нет проверенных источников');
   if(p.research?.provider!=='perplexity'||!independentEditorialGate(p))blockers.push('Нет актуального независимого редакционного заключения');
   if(!publicationDesignApproved(p))blockers.push('Оформление не утверждено');
   const candidate=archives?.get(p.id);
   const archived=candidate&&archiveMatchesPost(candidate,p)?candidate:null;
   return {id:p.id,title:p.title,revision:p.revision,kind:p.kind,blockers,
    editorialGatePassed:blockers.length===0,artifactStatus:archived?'ARCHIVE_HASH_VERIFIED' as const:'UNVERIFIED' as const,archive:archived,musicStatus:'UNVERIFIED' as const};
  });
  return {date,materials,status:materials.length===0?'UNASSIGNED':materials.length>1?'MULTIPLE_COMMITMENTS':'ASSIGNED'};
 });
 return {startDate,endDate:dates[6],target:7,assignedDays:rows.filter(r=>r.materials.length>0).length,
  editorialCandidateDays:rows.filter(r=>r.materials.length===1&&r.materials[0].editorialGatePassed).length,
  verifiedPackages:null,archivedDays:archives===undefined?null:rows.filter(r=>r.materials.some(m=>m.archive!==null)).length,rows,publicationAuthorized:false};
}
export function moscowCalendarDate(now:Date){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 return ['year','month','day'].map(k=>parts.find(p=>p.type===k)?.value).join('-');
}
