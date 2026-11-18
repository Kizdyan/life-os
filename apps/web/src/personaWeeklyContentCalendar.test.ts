import {describe,it,expect} from 'vitest';
import {createPersonaProject} from './personaProjectStore';
import {createSeedEditorialCarousel,approveEditorialStep,createEditorialFromTopic,TOPIC_CHOICES} from './personaEditorialModel';
import {
 localCalendarDate,calendarMonday,addCalendarDays,calendarWeekOffset,
 buildPersonaWeeklyCalendar,videoCalendarStatus,photoCalendarStatus,loadPersonaCalendarAnchor,
 PERSONA_WEEKLY_CALENDAR_KEY
} from './personaWeeklyContentCalendar';
import {PERSONA_ARCHITECT_IDS} from './personaArchitectSeeds';

const now='2026-11-18T12:00:00Z';
const videos=PERSONA_ARCHITECT_IDS.map((id,i)=>({
 ...createPersonaProject({id,title:'Reel '+String(i+1),contentType:'reel',sourceIdea:'Test',now}),
 stage:'needs_assets' as const
}));
const photos=Array.from({length:10},(_,i)=>({
 id:'test-photo-job-'+i,seedKey:'PHOTO-'+String(i+1).padStart(3,'0'),
 title:'Photo carousel '+String(i+1),state:'waiting_for_footage',productionStatus:'WAITING_FOR_FOOTAGE'
}));
const plans=()=>({videos,photos,anchorMonday:'2026-11-16'});

describe('Persona 10-week Reel / Carousel / Photo editorial calendar',()=>{
 it('uses seven local weekdays and is stable across DST and New Year',()=>{
  expect(calendarMonday('2026-11-18')).toBe('2026-11-16');
  expect(calendarMonday('2026-11-22')).toBe('2026-11-16');
  expect(calendarMonday('2026-11-23')).toBe('2026-11-23');
  expect(addCalendarDays('2026-12-31',1)).toBe('2027-01-01');
  expect(calendarWeekOffset('2026-11-16','2026-11-23')).toBe(1);
  expect(calendarWeekOffset('2026-03-23','2026-03-30')).toBe(1);
  expect(localCalendarDate(new Date(2026,10,18))).toBe('2026-11-18');
  expect(()=>calendarMonday('2026-02-30')).toThrow();
 });
 it('schedules 30 slots across 10 weeks: Mon video, Wed existing carousel, Fri topic-first photo',()=>{
  const videoSeen=new Set<string>(),carouselSeen=new Set<string>(),photoSlots=new Set<string>();
  for(let i=0;i<10;i++){
   const monday=addCalendarDays('2026-11-16',i*7);
   const plan=buildPersonaWeeklyCalendar({...plans(),weekMonday:monday});
   expect(plan.days).toHaveLength(7);
   expect(plan.items).toHaveLength(3);
   expect(plan.items.map(x=>x.kind)).toEqual(['video','carousel','photo']);
   expect(plan.items.map(x=>x.dayIndex)).toEqual([0,2,4]);
   expect(plan.items[0].projectId).toBe('reel-'+String(i+1).padStart(2,'0'));
   expect(plan.items[1].projectId).toBe('test-photo-job-'+i);
   expect(plan.items[2].placeholder).toBe(true);
   expect(plan.items[2].status).toBe('Тема не выбрана');
   videoSeen.add(plan.items[0].sourceId);
   carouselSeen.add(plan.items[1].sourceId);
   photoSlots.add(plan.items[2].sourceId);
  }
  expect(videoSeen.size).toBe(10);
  expect(carouselSeen.size).toBe(10);
  expect(photoSlots.size).toBe(10);
  const first=buildPersonaWeeklyCalendar({...plans(),weekMonday:'2026-11-16'});
  expect(first.items.map(x=>[x.sourceId,x.dayIndex,x.status])).toEqual([
   ['reel-01',0,'Ждёт видео'],['PHOTO-001',2,'Ждёт фото'],['photo-week-01',4,'Тема не выбрана']
  ]);
 });
 it('keeps missing sources visible as unapproved planning slots, never fabricates media jobs',()=>{
  const result=buildPersonaWeeklyCalendar({
   videos:videos.slice(0,1),photos:[],anchorMonday:'2026-11-16',weekMonday:'2026-11-16'
  });
  expect(result.items).toHaveLength(3);
  expect(result.items[1].projectId).toBe('PHOTO-001');
  expect(result.items[1].placeholder).toBe(true);
  expect(result.items[1].status).toMatch(/Worker/);
  expect(result.items[2].placeholder).toBe(true);
  expect(result.missingPhotos).toBe(1);
 });
 it('reflects distinct editorial approvals, Worker rendering and video milestones without inventing publishing',()=>{
  expect(videoCalendarStatus({...videos[0],stage:'final_qa'})).toBe('На проверке');
  expect(videoCalendarStatus({...videos[0],stage:'approval'})).toBe('Готово к съёмке');
  expect(videoCalendarStatus({...videos[0],stage:'production'})).toBe('В работе');
  expect(photoCalendarStatus({...photos[0],state:'completed',ready:true})).toBe('На проверке');
  expect(photoCalendarStatus({...photos[0],state:'failed'})).toBe('Требует внимания');
  const seed=createSeedEditorialCarousel('PHOTO-001');
  const weekly=buildPersonaWeeklyCalendar({...plans(),editorialPosts:[seed],weekMonday:'2026-11-16'});
  expect(weekly.items[1].status).toBe('Тема на утверждении');
  const approved=approveEditorialStep(approveEditorialStep(approveEditorialStep(seed,'topic'),'content'),'design');
  expect(buildPersonaWeeklyCalendar({...plans(),editorialPosts:[approved],
   weekMonday:'2026-11-16'}).items[1].status).toBe('Готов к производству');
 });
 it('updates the Friday slot when a topic is selected, and adds manually scheduled posts without shifting existing slots',()=>{
  const idea=TOPIC_CHOICES.find(x=>x.kind==='photo')!;
  const Friday=createEditorialFromTopic('photo-week-01',idea);
  const extra=createEditorialFromTopic('editorial-photo-extra',idea);
  extra.scheduledDate='2026-11-17';
  const plan=buildPersonaWeeklyCalendar({...plans(),editorialPosts:[Friday,extra],weekMonday:'2026-11-16'});
  expect(plan.items).toHaveLength(4);
  expect(plan.items.find(x=>x.sourceId==='photo-week-01')?.title).toBe(idea.title);
  expect(plan.items.find(x=>x.sourceId==='photo-week-01')?.placeholder).toBe(false);
  expect(plan.items.find(x=>x.sourceId==='editorial-photo-extra')?.scheduledDate).toBe('2026-11-17');
  expect(plan.items.find(x=>x.sourceId==='PHOTO-001')?.dayIndex).toBe(2);
 });
 it('persists the calendar anchor without silently shifting existing dates',()=>{
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,
   setItem:(key:string,value:string)=>{data.set(key,value)}};
  expect(loadPersonaCalendarAnchor(storage,'2026-11-18')).toBe('2026-11-16');
  expect(data.get(PERSONA_WEEKLY_CALENDAR_KEY)).toBe('2026-11-16');
  expect(loadPersonaCalendarAnchor(storage,'2026-11-25')).toBe('2026-11-16');
 });
});
