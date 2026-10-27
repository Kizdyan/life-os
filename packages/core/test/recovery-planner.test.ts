import { describe, expect, it } from 'vitest';
import type { LifeItem } from '../src/life-item';
import { planRecoverySlot } from '../src/recovery-planner';

function item(overrides:Partial<LifeItem>={}):LifeItem{return{id:'gym',kind:'habit',title:'Зал',status:'missed_time',plannedStart:'2026-10-01T12:00:00+03:00',plannedEnd:'2026-10-01T13:00:00+03:00',actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:'2026-10-01T08:00:00+03:00',updatedAt:'2026-10-01T13:00:00+03:00',...overrides};}

describe('recovery planner',()=>{
  it('finds a full retry slot after the first miss',()=>{
    const result=planRecoverySlot({item:item(),consecutiveMisses:1,date:'2026-10-02',blocks:[{id:'busy',title:'Дело',start:'2026-10-02T09:00:00',end:'2026-10-02T10:00:00',fixed:true,sourceId:null}],normalDurationMin:60,minimumDurationMin:20,dayStart:'09:00',dayEnd:'14:00'});
    expect(result).toMatchObject({action:'retry_soon',durationMin:60});
    expect(result?.start).toContain('2026-10-02T10:00:00');
  });

  it('keeps the stated local clock when a fixed block includes an offset',()=>{
    const result=planRecoverySlot({item:item(),consecutiveMisses:1,date:'2026-10-02',blocks:[{id:'busy',title:'Дело',start:'2026-10-02T09:00:00+03:00',end:'2026-10-02T10:00:00+03:00',fixed:true,sourceId:null}],normalDurationMin:60,minimumDurationMin:20,dayStart:'09:00',dayEnd:'14:00'});
    expect(result?.start).toBe('2026-10-02T10:00:00');
  });

  it('shrinks to the minimum version after repeated misses',()=>{
    const result=planRecoverySlot({item:item(),consecutiveMisses:2,date:'2026-10-02',blocks:[],normalDurationMin:60,minimumDurationMin:20,dayStart:'09:00',dayEnd:'12:00'});
    expect(result).toMatchObject({action:'minimum_version',durationMin:20});
  });

  it('does not schedule a fixed missed event',()=>{
    const result=planRecoverySlot({item:item({kind:'event',title:'Спектакль'}),consecutiveMisses:1,date:'2026-10-02',blocks:[],normalDurationMin:60,minimumDurationMin:20});
    expect(result).toBeNull();
  });
});
