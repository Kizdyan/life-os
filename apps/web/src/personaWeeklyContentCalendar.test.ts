import {describe,it,expect} from 'vitest';
import {createPersonaProject,type PersonaProject} from './personaProjectStore';
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
 title:'Photo '+String(i+1),state:'waiting_for_footage',productionStatus:'WAITING_FOR_FOOTAGE'
}));

describe('Unified 20-project weekly content calendar',()=>{
 it('uses seven LOCAL weekdays and remains stable across daylight-saving weeks',()=>{
  expect(calendarMonday('2026-11-18')).toBe('2026-11-16');
  expect(calendarMonday('2026-11-22')).toBe('2026-11-16');
  expect(calendarMonday('2026-11-23')).toBe('2026-11-23');
  expect(addCalendarDays('2026-12-31',1)).toBe('2027-01-01');
  expect(calendarWeekOffset('2026-11-16','2026-11-23')).toBe(1);
  expect(calendarWeekOffset('2026-03-23','2026-03-30')).toBe(1);
  expect(localCalendarDate(new Date(2026,10,18))).toBe('2026-11-18');
  expect(()=>calendarMonday('2026-02-30')).toThrow();
 });
 it('places exactly 20 real projects once in seven weeks, three per week except last',()=>{
  const visited=new Set<string>();
  for(let i=0;i<7;i++){
   const monday=addCalendarDays('2026-11-16',i*7);
   const plan=buildPersonaWeeklyCalendar({
    videos,photos,anchorMonday:'2026-11-16',weekMonday:monday
   });
   expect(plan.days).toHaveLength(7);
   expect(plan.items).toHaveLength(i===6?2:3);
   for(const item of plan.items){
    expect(visited.has(item.sourceId)).toBe(false);
    visited.add(item.sourceId);
    expect(plan.days[item.dayIndex].items).toContain(item);
    expect([0,2,4]).toContain(item.dayIndex);
    expect(item.scheduledDate).toBe(addCalendarDays(monday,item.dayIndex));
    expect(item.kind==='video'?'Видео':'Фото').toBeTruthy();
   }
  }
  expect(visited.size).toBe(20);
  expect(visited.has('reel-10')).toBe(true);
  expect(visited.has('PHOTO-010')).toBe(true);
  const first=buildPersonaWeeklyCalendar({videos,photos,anchorMonday:'2026-11-16',weekMonday:'2026-11-16'});
  expect(first.items.map(x=>[x.sourceId,x.dayIndex,x.status])).toEqual([
   ['reel-01',0,'Ждёт видео'],['PHOTO-001',2,'Ждёт фото'],['reel-02',4,'Ждёт видео']
  ]);
 });
 it('always opens the real source and does not invent placeholders if Worker or browser seeds are missing',()=>{
  const result=buildPersonaWeeklyCalendar({
   videos:videos.slice(0,1),photos:photos.slice(0,1),
   anchorMonday:'2026-11-16',weekMonday:'2026-11-16'
  });
  expect(result.items).toHaveLength(2);
  expect(result.items[0].projectId).toBe('reel-01');
  expect(result.items[1].projectId).toBe('test-photo-job-0');
  expect(result.missingVideos).toBe(1);
  expect(result.days[4].items).toHaveLength(0);
 });
 it('reflects actual persisted stages; never confuses completed render with publication approval',()=>{
  expect(videoCalendarStatus({...videos[0],stage:'final_qa'})).toBe('На проверке');
  expect(videoCalendarStatus({...videos[0],stage:'approval'})).toBe('Готово к съёмке');
  expect(videoCalendarStatus({...videos[0],stage:'production'})).toBe('В работе');
  expect(photoCalendarStatus({...photos[0],state:'completed',ready:true})).toBe('На проверке');
  expect(photoCalendarStatus({...photos[0],state:'failed'})).toBe('Требует внимания');
 });
 it('persists Monday anchor without overwriting it on repeated visits',()=>{
  const data=new Map<string,string>();
  const storage={getItem:(key:string)=>data.get(key)??null,
   setItem:(key:string,value:string)=>{data.set(key,value)}};
  expect(loadPersonaCalendarAnchor(storage,'2026-11-18')).toBe('2026-11-16');
  expect(data.get(PERSONA_WEEKLY_CALENDAR_KEY)).toBe('2026-11-16');
  expect(loadPersonaCalendarAnchor(storage,'2026-11-25')).toBe('2026-11-16');
 });
});
