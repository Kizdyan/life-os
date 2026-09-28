import {describe,expect,it} from 'vitest';
import {closeDay} from '../src/automation';
import type {DueItem} from '../src/automation';

const base:DueItem={id:'theory',kind:'task',title:'Теория музыки',status:'planned',plannedDate:'2026-09-30',plannedStart:'2026-09-30T12:00:00+03:00',plannedEnd:null,actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'x',updatedAt:'x'};

describe('day automation',()=>{
 it('preserves the miss and carries important unfinished work',()=>{
  const b=closeDay([base],'2026-09-30','2026-10-01','2026-09-30T23:59:00+03:00',{carryForwardKinds:['task'],maxCarryDays:7});
  expect(b.results[0].outcome.result).toBe('missed_time');
  expect(b.results[0].successor?.plannedStart).toContain('2026-10-01');
 });
 it('does not carry routines by default',()=>{
  const b=closeDay([{...base,id:'wake',kind:'routine'}],'2026-09-30','2026-10-01','now',{carryForwardKinds:['task'],maxCarryDays:7});
  expect(b.results[0].outcome.result).toBe('not_completed');
  expect(b.results[0].successor).toBeNull();
 });
});
