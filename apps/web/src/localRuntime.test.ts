import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import {
  applyLocalOutcome,
  applyLocalPlan,
  readLocalToday,
  readLocalItems,
  type StorageLike,
} from './localRuntime';

class MemoryStorage implements StorageLike {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null}
  setItem(key:string,value:string){this.values.set(key,value)}
}

const plan=[
  {title:'Зал',kind:'task',planned_start:'2026-10-02T12:00:00+03:00',planned_end:'2026-10-02T13:00:00+03:00'},
  {title:'Театр',kind:'event',planned_start:'2026-10-02T16:00:00+03:00',planned_end:null},
];

describe('browser-local Life OS runtime',()=>{
  it('stores a plan idempotently and returns it for Today without cloud storage',()=>{
    const storage=new MemoryStorage();let id=0;
    const first=applyLocalPlan(storage,'plan-key',plan,()=>`local-${++id}`);
    const second=applyLocalPlan(storage,'plan-key',plan,()=>`local-${++id}`);

    expect(first).toMatchObject({applied:true,replayed:false});
    expect(second).toEqual({applied:false,ids:first.ids,replayed:true});
    expect(readLocalToday(storage,'2026-10-02').map(x=>x.title)).toEqual(['Зал','Театр']);
  });

  it('shows future tasks in Tasks and on the matching Calendar date',()=>{
    const storage=new MemoryStorage();let id=0;
    applyLocalPlan(storage,'future',[
      {title:'Репетиция',kind:'task',planned_start:'2026-10-20T13:00:00+03:00',planned_end:null},
      {title:'Спектакль',kind:'task',planned_start:'2026-10-21T19:00:00+03:00',planned_end:null},
    ],()=>`future-${++id}`);
    expect(readLocalToday(storage,'2026-10-19')).toEqual([]);
    expect(readLocalItems(storage).map(item=>item.title)).toEqual(['Репетиция','Спектакль']);
    expect(readLocalItems(storage).filter(item=>item.planned_start?.slice(0,10)==='2026-10-20').map(item=>item.title)).toEqual(['Репетиция']);
  });

  it('marks completion without losing planned timing',()=>{
    const storage=new MemoryStorage();
    applyLocalPlan(storage,'p',plan,()=>crypto.randomUUID());
    const gym=readLocalToday(storage,'2026-10-02')[0];

    applyLocalOutcome(storage,gym,'complete',()=>crypto.randomUUID());
    const updated=readLocalToday(storage,'2026-10-02').find(x=>x.id===gym.id)!;

    expect(updated.status).toBe('completed');
    expect(updated.planned_start).toBe(gym.planned_start);
    expect(updated.planned_end).toBe(gym.planned_end);
  });

  it('carries a missed flexible item forward when carry_forward is enabled',()=>{
    const storage=new MemoryStorage();let id=0;
    applyLocalPlan(storage,'p',[{...plan[0],carry_forward:true}],()=>`id-${++id}`);
    const gym=readLocalToday(storage,'2026-10-02')[0];

    const result=applyLocalOutcome(storage,gym,'not_complete',()=>`id-${++id}`);

    expect(result.current.status).toBe('missed_time');
    expect(result.successor?.status).toBe('planned');
    expect(result.successor?.planned_start?.startsWith('2026-10-03T12:00:00')).toBe(true);
    expect(readLocalToday(storage,'2026-10-03')).toHaveLength(1);
  });

  it('keeps an unknown end null when carrying forward',()=>{
    const storage=new MemoryStorage();let id=0;
    applyLocalPlan(storage,'p',[{...plan[1],carry_forward:true}],()=>`id-${++id}`);
    const theatre=readLocalToday(storage,'2026-10-02')[0];

    const result=applyLocalOutcome(storage,theatre,'not_complete',()=>`id-${++id}`);

    expect(result.successor?.planned_end).toBeNull();
  });

  it('ignores malformed persisted state instead of crashing the app',()=>{
    const storage=new MemoryStorage();
    storage.setItem('life-os:local-runtime:v1','not-json');
    expect(readLocalToday(storage,'2026-10-02')).toEqual([]);
  });
});
