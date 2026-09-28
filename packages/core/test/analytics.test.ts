import {describe,expect,it} from 'vitest';
import {outcomeStats} from '../src/analytics';

describe('analytics',()=>{
 it('keeps on-time misses visible after later carry-forward',()=>{
  const s=outcomeStats([
   {id:'1',itemId:'x',plannedDate:'2026-09-30',result:'missed_time',recordedAt:'x',source:'system',successorItemId:'y'},
   {id:'2',itemId:'y',plannedDate:'2026-10-01',result:'completed',recordedAt:'x',source:'ui',successorItemId:null}
  ]);
  expect(s.missedOnTime).toBe(1); expect(s.completed).toBe(1); expect(s.planned).toBe(2);
 });
});
