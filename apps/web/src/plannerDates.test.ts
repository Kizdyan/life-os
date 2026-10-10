import {describe,expect,it} from 'vitest';
import {addDays,captureDraft,localToday,parseCapture} from './plannerDates';

describe('iPhone calendar quick capture: date and rollover safety',()=>{
 it('never moves a saved day across a timezone or DST boundary',()=>{
  expect(addDays('2026-10-31',1)).toBe('2026-11-01');
  expect(addDays('2026-12-31',1)).toBe('2027-01-01');
  expect(addDays('2026-03-29',-1)).toBe('2026-03-28');
 });
 it('retains a simple unscheduled task without inventing a clock time',()=>{
  expect(parseCapture('Купить струны','2026-10-10'))
   .toEqual({title:'Купить струны',date:'2026-10-10',start:null,end:null});
 });
 it('creates the next day of a midnight-crossing appointment instead of ending before it starts',()=>{
  expect(parseCapture('репетиция в 23:50 на 30 минут','2026-10-31'))
   .toEqual({title:'репетиция',date:'2026-10-31',
    start:'2026-10-31T23:50:00',end:'2026-11-01T00:20:00'});
 });
 it('combines tomorrow and month-end rollover without changing the starting date',()=>{
  expect(parseCapture('съёмка завтра в 23:30 на 90 минут','2026-12-30'))
   .toEqual({title:'съёмка',date:'2026-12-31',
    start:'2026-12-31T23:30:00',end:'2027-01-01T01:00:00'});
 });
 it('does not persist impossible clock values as scheduled tasks',()=>{
  expect(parseCapture('репетиция в 25:99 на 60 минут','2026-10-10'))
   .toMatchObject({start:null,end:null});
 });
 it('preserves inbox semantics and correct local today',()=>{
  expect(captureDraft('Купить струны завтра в 16:00','2026-10-10',true))
   .toEqual({title:'Купить струны',planned_start:null,planned_end:null});
  expect(localToday(new Date(2026,9,10,23,50))).toBe('2026-10-10');
 });
});
