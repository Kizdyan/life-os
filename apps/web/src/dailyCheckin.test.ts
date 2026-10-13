import{describe,expect,it}from'vitest';import{makeDailyCheckin,readDailyCheckin,saveDailyCheckin,type CheckinStorage}from'./dailyCheckin';class S implements CheckinStorage{m=new Map<string,string>();getItem(k:string){return this.m.get(k)||null}setItem(k:string,v:string){this.m.set(k,v)}}describe('daily check-in',()=>{it('persists all subjective metrics',()=>{const s=new S(),x=makeDailyCheckin({date:'2026-10-06',mood:7,focus:6,workQuality:8,daySatisfaction:7,wellbeing:6,energy:5,note:''});saveDailyCheckin(s,x);expect(readDailyCheckin(s,'2026-10-06')).toMatchObject({mood:7,focus:6,workQuality:8,daySatisfaction:7,wellbeing:6,energy:5})});it('rejects scores outside 1..10',()=>{expect(()=>makeDailyCheckin({date:'x',mood:11 as any,focus:5,workQuality:5,daySatisfaction:5,wellbeing:5,energy:5,note:''})).toThrow()})});

import {
  makePrimeDailyReflection, readPrimeDailyReflection, readPrimeDailyReflections,
  savePrimeDailyReflection, applyRemoteCheckins, readDailyCheckins,
} from './dailyCheckin';
describe('Prime Build is a private facet of canonical Check-ins', () => {
  it('does not fabricate ordinary mood/energy when saving only Prime nightly answers', () => {
    const s = new S();
    const p = makePrimeDailyReflection('2026-10-13', ['Тренировка','Искал подтверждение','Сделаю музыку'], 8, 7);
    savePrimeDailyReflection(s, p);
    expect(readPrimeDailyReflection(s, p.date)?.answers[0]).toBe('Тренировка');
    expect(readDailyCheckins(s)).toHaveLength(0);
    expect(readPrimeDailyReflections(s)).toHaveLength(1);
    expect(p.privacyClass).toBe('PRIVATE');
    expect(p.personaExposure).toBe('blocked');
  });
  it('preserves both check-in facets on repeated updates without duplicating dates', () => {
    const s = new S(), date = '2026-10-13';
    savePrimeDailyReflection(s, makePrimeDailyReflection(date, ['a','b','c']));
    saveDailyCheckin(s, makeDailyCheckin({date,mood:7,focus:6,workQuality:5,daySatisfaction:7,wellbeing:6,energy:8,note:''}));
    savePrimeDailyReflection(s, makePrimeDailyReflection(date, ['a','corrected','c']));
    saveDailyCheckin(s, makeDailyCheckin({date,mood:8,focus:6,workQuality:5,daySatisfaction:7,wellbeing:6,energy:8,note:''}));
    expect(readDailyCheckins(s)).toHaveLength(1);
    expect(readDailyCheckin(s,date)?.mood).toBe(8);
    expect(readPrimeDailyReflections(s)).toHaveLength(1);
    expect(readPrimeDailyReflection(s,date)?.answers[1]).toBe('corrected');
  });
  it('hydrates only explicitly classified private Prime check-ins via existing runtime sync', () => {
    const s = new S(), date = '2026-10-13', p = makePrimeDailyReflection(date, ['a','b','c']);
    const record = { id:p.id, userId:'owner', kind:'setting' as const, version:3,
      payload:{...p}, deleted:false, updatedAt:p.updatedAt };
    applyRemoteCheckins(s, [{...record,payload:{...p,privacyClass:'PUBLIC_SAFE'}}]);
    expect(readPrimeDailyReflection(s,date)).toBeNull();
    applyRemoteCheckins(s,[record]);
    expect(readPrimeDailyReflection(s,date)?.version).toBe(3);
    applyRemoteCheckins(s,[{...record,deleted:true}]);
    expect(readPrimeDailyReflection(s,date)).toBeNull();
  });
});
