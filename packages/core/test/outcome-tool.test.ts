import { describe, expect, it } from 'vitest';
import { LifeSetOutcomeTool } from '../src/outcome-tool';
import type { LifeItemRepository } from '../src/outcome-store';
import type { LifeItem } from '../src/life-item';

describe('LifeSetOutcomeTool', () => {
  it('persists a missed result and successor atomically at repository boundary', async () => {
    const item: LifeItem={id:'wake',kind:'routine',title:'Подъём',status:'planned',plannedStart:'2026-09-30T09:00:00+03:00',plannedEnd:null,actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'x',updatedAt:'x'};
    let committed:any;
    const repo:LifeItemRepository={get:async()=>item,commit:async r=>{committed=r}};
    const tool=new LifeSetOutcomeTool(repo,()=> '2026-09-30T10:00:00+03:00');
    await tool.execute({id:'a',actionGroupId:'a',tool:'life.set_outcome',input:{itemId:'wake',command:'not_complete',plannedDate:'2026-09-30',carryForward:true,nextDate:'2026-10-01',source:'ui'},risks:['reversible'],reversible:true,idempotencyKey:'x'});
    expect(committed.current.status).toBe('missed_time');
    expect(committed.successor.id).toBe('wake:2026-10-01');
  });
});
