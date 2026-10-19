import { describe, expect, it } from 'vitest';
import { createContextualCopy } from './erikaCopy';
import { applyLocalPlan, readLocalItems, type StorageLike } from './localRuntime';

const source = {
  id:'first', title:'Репетиция вокала', kind:'task', status:'planned' as const,
  planned_start:'2026-10-19T13:00:00+03:00', planned_end:null, carry_forward:false,
};
class MemoryStore implements StorageLike {
  private values = new Map<string,string>();
  getItem(k:string){return this.values.get(k) ?? null}
  setItem(k:string,v:string){this.values.set(k,v)}
}
describe('contextual task copy safety', () => {
  it('copies the real title to tomorrow and leaves the original unchanged', () => {
    const store = new MemoryStore();let seq=0;
    const original = createContextualCopy(source,'2026-10-19');
    applyLocalPlan(store,original.idempotencyKey,original.items,()=>`new-${++seq}`);
    const target = createContextualCopy(source,'2026-10-20');
    const first = applyLocalPlan(store,target.idempotencyKey,target.items,()=>`new-${++seq}`);
    const replay = applyLocalPlan(store,target.idempotencyKey,target.items,()=>`new-${++seq}`);
    expect(first.applied).toBe(true);
    expect(replay.replayed).toBe(true);
    expect(readLocalItems(store).map(x=>[x.title,x.planned_start])).toEqual([
      ['Репетиция вокала','2026-10-19T13:00:00+03:00'],
      ['Репетиция вокала','2026-10-20T13:00:00+03:00'],
    ]);
    expect(source.planned_start).toBe('2026-10-19T13:00:00+03:00');
  });
  it('rejects invalid dates and ambiguous overnight duration', () => {
    expect(()=>createContextualCopy(source,'2026-02-31')).toThrow();
    expect(()=>createContextualCopy({...source, planned_end:'2026-10-20T01:00:00+03:00'},'2026-10-21')).toThrow();
  });
});
