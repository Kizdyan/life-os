/** Persona 90-day editorial projection. Planning data only: no publishing, no invented research. */
export const WEEKLY_SLOTS = Object.freeze([
  {weekday:2,format:'reel',purpose:'reach-and-portfolio'},
  {weekday:4,format:'carousel',purpose:'storytelling-and-expertise'},
  {weekday:6,format:'photo',purpose:'personal-story'},
]);
const iso = date => date.toISOString().slice(0,10);
const addDays = (date,days) => new Date(date.getTime()+days*86400000);
function mondayOf(value){
 const date=new Date(value+'T00:00:00Z');
 if(Number.isNaN(date.getTime())||iso(date)!==value)throw new Error('startDate must be YYYY-MM-DD');
 return addDays(date,-((date.getUTCDay()+6)%7));
}
/**
 * Rolling editorial calendar for the next 90 days, including a 14-day
 * production buffer. Does not replace Life OS tasks, calendar or analytics.
 * The caller attaches canonical content IDs and production statuses.
 */
export function buildPersonaEditorialCalendar({startDate,days=90,existing=[],sprintStartDate=null,occupiedDates=[]}={}){
 if(!Number.isInteger(days)||days<7||days>366)throw new Error('days must be 7..366');
 const start=new Date(startDate+'T00:00:00Z');
 if(Number.isNaN(start.getTime())||iso(start)!==startDate)throw new Error('Invalid startDate');
 if(!Array.isArray(existing))throw new Error('existing must be an array');
 const startMonday=mondayOf(startDate),endExclusive=addDays(start,days);
 const sprintStart=sprintStartDate===null?null:new Date(sprintStartDate+'T00:00:00Z');
 if(sprintStart&&(Number.isNaN(sprintStart.getTime())||iso(sprintStart)!==sprintStartDate))throw Error('Invalid sprintStartDate');
 const sprintEnd=sprintStart?addDays(sprintStart,30):null;
 const inSprint=day=>Boolean(sprintStart&&day>=sprintStart&&day<sprintEnd);
 const byKey=new Map(existing.filter(item=>item&&typeof item.slotId==='string').map(item=>[item.slotId,item]));
 const slots=[];
 for(let week=0;week<Math.ceil((days+6)/7)+1;week++){
  for(const template of WEEKLY_SLOTS){
   const day=addDays(startMonday,week*7+template.weekday-1);
   if(day<start||day>=endExclusive||inSprint(day))continue;
   const date=iso(day),slotId='persona:'+date+':'+template.format;
   const previous=byKey.get(slotId);
   slots.push({
    slotId,date,weekIndex:Math.floor((day-startMonday)/604800000),
    format:template.format,purpose:template.purpose,
    status:previous?.status??'planned',
    contentId:previous?.contentId??null,
    approved:previous?.approved===true,
    platforms:Array.isArray(previous?.platforms)?[...previous.platforms]:template.format==='reel'?['instagram','youtube-shorts','vk-video','tiktok']:['instagram','vk'],
    ...(previous?.notes?{notes:previous.notes}:{}),
   });
  }
 }
 // Saved author edits from the old five-day schedule retain their original
 // dates, IDs, approval and notes. They are EXTRA entries, not silently moved
 // onto a new Tue/Thu/Sat slot; unmodified generated slots are not persisted.
 const canonical=new Set(slots.map(item=>item.slotId));
 for(const previous of byKey.values()){
  if(canonical.has(previous.slotId)||typeof previous.date!=='string'||
     !/^\d{4}-\d{2}-\d{2}$/.test(previous.date)||
     !['reel','carousel','photo'].includes(previous.format)||
     previous.slotId!=='persona:'+previous.date+':'+previous.format)continue;
  const date=new Date(previous.date+'T00:00:00Z');
  if(Number.isNaN(date.getTime())||iso(date)!==previous.date||date<start||date>=endExclusive)continue;
  slots.push({
   slotId:previous.slotId,date:previous.date,weekIndex:Math.floor((date-startMonday)/604800000),
   format:previous.format,purpose:previous.purpose??'author-saved',
   status:previous.status??'planned',contentId:previous.contentId??null,
   approved:previous.approved===true,
   platforms:Array.isArray(previous.platforms)?previous.platforms:
    previous.format==='reel'?['instagram','youtube-shorts','vk-video','tiktok']:['instagram','vk'],
   ...(typeof previous.notes==='string'?{notes:previous.notes}:{}),
   legacySavedDate:true,
  });
 }
 // Keep every explicitly saved record, even inside the sprint. Only fill unoccupied dates.
 // The sprint is a planning projection, never a promise of production or publication.
 if(sprintStart){
  if(!Array.isArray(occupiedDates)||occupiedDates.some(d=>typeof d!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||iso(new Date(d+'T00:00:00Z'))!==d))throw Error('Invalid occupiedDates');
  const occupied=new Set([...slots.map(s=>s.date),...occupiedDates]);
  for(let day=new Date(start);day<endExclusive;day=addDays(day,1)){
   if(!inSprint(day)||occupied.has(iso(day)))continue;
   const date=iso(day);
   slots.push({slotId:'persona:'+date+':carousel',date,weekIndex:Math.floor((day-startMonday)/604800000),
    format:'carousel',purpose:'daily-editorial-sprint',status:'planned',contentId:null,approved:false,
    platforms:['instagram','tiktok','vk','youtube-community','threads']});
  }
 }
 slots.sort((a,b)=>a.date.localeCompare(b.date)||a.format.localeCompare(b.format));
 return {
  version:1,horizon:{startDate,endDate:iso(addDays(start,days-1)),days},
  target:sprintStart?{reelsPerWeek:0,photosPerWeek:0,carouselsPerWeek:7,stories:'optional'}:{reelsPerWeek:1,photosPerWeek:1,carouselsPerWeek:1,stories:'optional'},
  reserveTarget:sprintStart?{reels:0,photos:0,carousels:7}:{reels:2,photos:2,carousels:2},
  ...(sprintStart?{sprint:{startDate:sprintStartDate,endDate:iso(addDays(sprintStart,29)),timezone:'Europe/Moscow',status:'PLANNING_ONLY'}}:{}),
  slots,
  guidance:{
   batchProduction:sprintStart?'Fill only free dates during the 30-day sprint, preserve saved commitments; prepare seven reviewed carousel packages, not seven empty slots.':'Group shoots and prepare a rolling 14-day approved buffer; Tue Reel, Thu Carousel, Sat Photo are proposed slots, never forced publication.',
   publishing:'Never infer published from planned. Require explicit approval and per-platform verified delivery status.',
   stories:'Supplementary stories are not counted in the three weekly core publications.',
   longForm:'Long-form YouTube/VK is a separate production lane, not counted in the three weekly core publications.',
   experimentation:'Trial-mode distribution is platform-specific and opt-in; do not promise it exists for every account.',
  },
 };
}
