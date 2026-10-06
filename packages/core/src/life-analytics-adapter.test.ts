import{describe,expect,it}from'vitest';
import{lifeObservationsFromInputs}from'./life-analytics-adapter';

describe('life analytics observation adapter',()=>{
 it('turns task outcomes and check-ins into normalized observations',()=>{
  const observations=lifeObservationsFromInputs({
   items:[
    {id:'a',kind:'task',title:'A',status:'completed',plannedStart:'2026-10-06T10:00:00+03:00',plannedEnd:'2026-10-06T11:00:00+03:00',actualStart:'2026-10-06T10:02:00+03:00',actualEnd:'2026-10-06T10:55:00+03:00',projectId:'p1',version:1,createdAt:'2026-10-06T08:00:00Z',updatedAt:'2026-10-06T08:00:00Z'},
    {id:'b',kind:'task',title:'B',status:'moved',plannedStart:'2026-10-06T12:00:00+03:00',plannedEnd:null,actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'2026-10-06T08:00:00Z',updatedAt:'2026-10-06T08:00:00Z'}
   ],
   checkins:[{date:'2026-10-06',sleepHours:7.5,energy:8,mood:7,note:null}],
  });
  expect(observations.filter(x=>x.metric==='task_planned')).toHaveLength(2);
  expect(observations.filter(x=>x.metric==='task_completed')).toHaveLength(1);
  expect(observations.filter(x=>x.metric==='task_on_time')).toHaveLength(1);
  expect(observations.filter(x=>x.metric==='task_moved')).toHaveLength(1);
  expect(observations.find(x=>x.metric==='sleep_minutes')?.value).toBe(450);
  expect(observations.find(x=>x.metric==='energy')?.value).toBe(8);
  expect(observations.find(x=>x.metric==='mood')?.value).toBe(7);
 });
 it('does not invent on-time completion without planned and actual timing',()=>{
  const observations=lifeObservationsFromInputs({items:[{id:'x',kind:'task',title:'X',status:'completed',plannedStart:null,plannedEnd:null,actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'2026-10-06T08:00:00Z',updatedAt:'2026-10-06T08:00:00Z'}],checkins:[]});
  expect(observations.some(x=>x.metric==='task_on_time')).toBe(false);
 });
});
