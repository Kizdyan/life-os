import {describe,it,expect} from 'vitest';
import {WEEKLY_ANCHOR_KEY,EDITORIAL_CALENDAR_KEY,readCalendarBackup,validateCalendarBackup,mergeCalendarBackup,writeCalendarBackup,type CalendarBackup} from './personaCalendarBackup';
const slot={slotId:'persona:2026-11-27:carousel',date:'2026-11-27',format:'carousel' as const,purpose:'editorial',status:'planned',contentId:'existing-material',approved:false,platforms:['instagram'],notes:'Keep date'};
const fixture:CalendarBackup={weeklyAnchor:'2026-11-23',editorialSlots:[slot]};
describe('calendar backup compatibility',()=>{
 it('preserves both stores and exact saved commitments',()=>{
  const m=new Map<string,string>(),storage={getItem:(k:string)=>m.get(k)??null,setItem:(k:string,v:string)=>{m.set(k,v)}};
  expect(readCalendarBackup(storage)).toEqual({weeklyAnchor:null,editorialSlots:null});
  writeCalendarBackup(storage,fixture);expect(readCalendarBackup(storage)).toEqual(fixture);
  expect(m.get(WEEKLY_ANCHOR_KEY)).toBe(fixture.weeklyAnchor);
  expect(JSON.parse(m.get(EDITORIAL_CALENDAR_KEY)!)).toEqual([slot]);
  expect(mergeCalendarBackup(fixture,fixture)).toEqual(fixture);
 });
 it('blocks contradictory dates or slot content and fails closed on malformed data',()=>{
  expect(()=>mergeCalendarBackup(fixture,{...fixture,weeklyAnchor:'2026-11-30'})).toThrow();
  expect(()=>mergeCalendarBackup(fixture,{...fixture,editorialSlots:[{...slot,notes:'Conflict'}]})).toThrow();
  expect(()=>validateCalendarBackup({...fixture,editorialSlots:[slot,slot]})).toThrow();
  expect(()=>validateCalendarBackup({...fixture,weeklyAnchor:'2026-02-30'})).toThrow();
  expect(()=>readCalendarBackup({getItem:k=>k===EDITORIAL_CALENDAR_KEY?'invalid':null})).toThrow();
 });
 it('retains a legacy absent calendar and merges independent slot records',()=>{
  expect(mergeCalendarBackup({weeklyAnchor:null,editorialSlots:null},fixture)).toEqual(fixture);
  const next={...slot,slotId:'persona:2026-11-28:carousel',date:'2026-11-28'};
  expect(mergeCalendarBackup(fixture,{weeklyAnchor:null,editorialSlots:[next]}).editorialSlots).toEqual([slot,next]);
 });
});
