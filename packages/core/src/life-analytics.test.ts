import { describe, expect, it } from 'vitest';
import { buildLifeAnalyticsSummary, type LifeObservation } from './life-analytics';

const o=(overrides:Partial<LifeObservation>):LifeObservation=>({id:'x',occurredAt:'2026-10-01T12:00:00+03:00',localDate:'2026-10-01',source:'life_os',metric:'task_planned',value:1,...overrides});

describe('Life Analytics Engine foundation',()=>{
  it('aggregates execution, deep work, sleep and subjective energy in one summary',()=>{
    const observations:LifeObservation[]=[
      o({id:'p1',metric:'task_planned'}),o({id:'p2',metric:'task_planned'}),o({id:'p3',metric:'task_planned'}),o({id:'p4',metric:'task_planned'}),
      o({id:'c1',metric:'task_completed'}),o({id:'c2',metric:'task_completed'}),o({id:'c3',metric:'task_completed'}),
      o({id:'t1',metric:'task_on_time'}),o({id:'t2',metric:'task_on_time'}),
      o({id:'m1',metric:'task_moved'}),
      o({id:'d1',metric:'deep_work_minutes',value:120}),o({id:'d2',metric:'deep_work_minutes',value:60}),
      o({id:'s1',metric:'sleep_minutes',value:420}),o({id:'s2',metric:'sleep_minutes',value:480,localDate:'2026-10-02'}),
      o({id:'e1',metric:'energy',value:6}),o({id:'e2',metric:'energy',value:8,localDate:'2026-10-02'}),
    ];
    const result=buildLifeAnalyticsSummary(observations,30);
    expect(result.execution).toEqual({planned:4,completed:3,completionRate:75,onTime:2,onTimeRate:50,moved:1,moveRate:25});
    expect(result.deepWorkMinutes).toBe(180);
    expect(result.sleep.averageMinutes).toBe(450);
    expect(result.energy.average).toBe(7);
  });

  it('keeps sparse data explicit instead of inventing correlations',()=>{
    const result=buildLifeAnalyticsSummary([o({id:'s',metric:'sleep_minutes',value:420}),o({id:'e',metric:'energy',value:7})],30);
    expect(result.insights).toEqual([]);
    expect(result.dataQuality.correlationReady).toBe(false);
  });

  it('groups by supplied localDate rather than UTC date',()=>{
    const result=buildLifeAnalyticsSummary([
      o({id:'late',occurredAt:'2026-09-30T22:30:00Z',localDate:'2026-10-01',metric:'energy',value:5}),
      o({id:'morning',occurredAt:'2026-10-01T08:00:00+03:00',localDate:'2026-10-01',metric:'energy',value:7}),
    ],7);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].date).toBe('2026-10-01');
    expect(result.days[0].energyAverage).toBe(6);
  });
});
