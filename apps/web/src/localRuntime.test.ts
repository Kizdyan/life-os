import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import {
  applyLocalOutcome,
  applyLocalPlan,
  readLocalToday,
  deleteLocalTask,
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

  it('deletes only the requested task and preserves other tasks safely',()=>{
    const storage=new MemoryStorage();let count=0;
    const result=applyLocalPlan(storage,'many',plan,()=>`id-${++count}`);
    expect(deleteLocalTask(storage,result.ids[0])).toBe(true);
    expect(deleteLocalTask(storage,result.ids[0])).toBe(false);
    expect(readLocalToday(storage,'2026-10-02').map(x=>x.title)).toEqual(['Театр']);
    const raw=JSON.parse(storage.getItem('life-os:local-runtime:v1')!);
    expect(raw.plans.many).toEqual([result.ids[1]]);
    expect(deleteLocalTask(storage,result.ids[1])).toBe(true);
    expect(raw.items.length).toBe(1);
    const again=applyLocalPlan(storage,'many',plan,()=>`id-${++count}`);
    expect(again.replayed).toBe(false);
  });

  it('ignores malformed persisted state instead of crashing the app',()=>{
    const storage=new MemoryStorage();
    storage.setItem('life-os:local-runtime:v1','not-json');
    expect(readLocalToday(storage,'2026-10-02')).toEqual([]);
  });
});
