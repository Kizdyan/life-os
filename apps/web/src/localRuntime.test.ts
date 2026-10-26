import { describe, expect, it } from 'vitest';
import type { Item } from './types';
import {
  applyLocalOutcome,
  applyLocalPlan,
  readLocalToday,
  deleteLocalTask,
  editLocalTask,
  findLocalTimeConflicts,
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

  it('never silently discards or overwrites corrupted local data',()=>{
    const storage=new MemoryStorage();
    storage.setItem('life-os:local-runtime:v1','not-json');
    expect(()=>readLocalToday(storage,'2026-10-02')).toThrow('повреждены');
    expect(()=>applyLocalPlan(storage,'new',plan,()=>crypto.randomUUID())).toThrow('повреждены');
    expect(storage.getItem('life-os:local-runtime:v1')).toBe('not-json');
  });

  it('refuses nonexistent task outcomes rather than inserting ghost records',()=>{
    const storage=new MemoryStorage();
    const missing:Item={id:'missing',title:'Неверная запись',kind:'task',status:'planned',
      planned_start:'2026-10-02T12:00:00+03:00',planned_end:null};
    expect(()=>applyLocalOutcome(storage,missing,'complete',()=>crypto.randomUUID())).toThrow('не найдена');
    expect(readLocalToday(storage,'2026-10-02')).toHaveLength(0);
  });

  it('repeated carry-forward produces exactly one successor, even after reopening',()=>{
    const storage=new MemoryStorage();
    let n=0;
    applyLocalPlan(storage,'carry',[{...plan[0],carry_forward:true}],()=>`id-${++n}`);
    const initial=readLocalToday(storage,'2026-10-02')[0];
    const first=applyLocalOutcome(storage,initial,'not_complete',()=>`id-${++n}`);
    expect(first.successor?.id).toBe('id-2');
    const again=applyLocalOutcome(storage,initial,'not_complete',()=>`id-${++n}`);
    expect(again.successor).toBeNull();
    expect(n).toBe(2);
    expect(readLocalToday(storage,'2026-10-03')).toHaveLength(1);
    expect(()=>applyLocalOutcome(storage,initial,'complete',()=>`id-${++n}`)).toThrow('перенесена');
  });

  it('edits title/time/day atomically and preserves completion and task ID',()=>{
    const storage=new MemoryStorage();
    applyLocalPlan(storage,'plan',plan,()=>crypto.randomUUID());
    const first=readLocalToday(storage,'2026-10-02')[0];
    applyLocalOutcome(storage,first,'complete',()=>crypto.randomUUID());
    const edited=editLocalTask(storage,first.id,{
      title:'Отрепетировать сцену',planned_start:'2026-10-03T10:00:00+03:00',
      planned_end:'2026-10-03T10:30:00+03:00',
    });
    expect(edited.id).toBe(first.id);
    expect(edited.status).toBe('completed');
    expect(readLocalToday(storage,'2026-10-02').map(x=>x.title)).toEqual(['Театр']);
    expect(readLocalToday(storage,'2026-10-03')[0].title).toBe('Отрепетировать сцену');
    expect(readLocalToday(storage,'2026-10-03')[0].planned_end).toBe('2026-10-03T10:30:00+03:00');
  });

  it('rejects invalid time windows without changing saved state',()=>{
    const storage=new MemoryStorage();
    applyLocalPlan(storage,'plan',plan,()=>crypto.randomUUID());
    const first=readLocalToday(storage,'2026-10-02')[0];
    const before=storage.getItem('life-os:local-runtime:v1');
    expect(()=>editLocalTask(storage,first.id,{
      title:'Поздно',planned_start:'2026-10-02T14:00:00+03:00',
      planned_end:'2026-10-02T13:00:00+03:00',
    })).toThrow('позже');
    expect(()=>applyLocalPlan(storage,'wrong',[{
      title:'Сломано',planned_start:'abc',planned_end:null,
    }],()=>crypto.randomUUID())).toThrow('начала');
    expect(storage.getItem('life-os:local-runtime:v1')).toBe(before);
  });

  it('can explicitly restore a completed task to planned, with conflict checks',()=>{
    const storage=new MemoryStorage();let n=0;
    const ids=applyLocalPlan(storage,'first',[plan[0]],()=>`id-${++n}`).ids;
    const task=readLocalToday(storage,'2026-10-02')[0];
    applyLocalOutcome(storage,task,'complete',()=>`id-${++n}`);
    const actual=editLocalTask(storage,ids[0],{
      title:task.title,planned_start:task.planned_start!,planned_end:task.planned_end,
      resetToPlanned:true,
    });
    expect(actual.status).toBe('planned');
    expect(readLocalToday(storage,'2026-10-02')[0].status).toBe('planned');
    expect(()=>editLocalTask(storage,ids[0],{
      title:task.title,planned_start:task.planned_start!,planned_end:task.planned_end,
      resetToPlanned:true,
    })).toThrow('только для');
  });

  it('prevents accidental time collisions in edits and new Erika plans',()=>{
    const storage=new MemoryStorage();
    let seq=0;
    applyLocalPlan(storage,'one',plan,()=>`id-${++seq}`);
    const editable=readLocalToday(storage,'2026-10-02')[1];
    const proposed={title:'Новая репетиция',planned_start:'2026-10-02T12:30:00+03:00',
      planned_end:'2026-10-02T13:30:00+03:00'};
    expect(findLocalTimeConflicts(storage,proposed,editable.id).map(x=>x.title)).toEqual(['Зал']);
    const before=storage.getItem('life-os:local-runtime:v1');
    expect(()=>editLocalTask(storage,editable.id,proposed)).toThrow('Пересечение');
    expect(()=>applyLocalPlan(storage,'two',[proposed],()=>`id-${++seq}`)).toThrow('Пересечение');
    expect(storage.getItem('life-os:local-runtime:v1')).toBe(before);
    const adjacent={...proposed,planned_start:'2026-10-02T13:00:00+03:00',
      planned_end:'2026-10-02T13:30:00+03:00'};
    expect(findLocalTimeConflicts(storage,adjacent)).toEqual([]);
    expect(editLocalTask(storage,editable.id,adjacent).title).toBe('Новая репетиция');
  });
});
