import { describe, expect, it } from 'vitest';
import { parseErikaDiscourse } from './erika-discourse';

const FULL='Завтра у меня театр в 16:00. Выйти нужно в 15:30. До театра хочу сходить в зал, потом поесть. Ещё нужно позвонить Даше. После театра, если освобожусь не поздно, поехать к дочке.';

describe('Erika discourse parser',()=>{
  it('parses the full theatre utterance without inventing an event end or unnecessary clarification',()=>{
    const result=parseErikaDiscourse(FULL,{today:'2026-10-02'});

    expect(result.dateContext).toBe('2026-10-03');
    expect(result.ambiguities).toEqual([]);
    expect(result.uncoveredClauses).toEqual([]);
    expect(result.items).toHaveLength(6);

    const theatre=result.items.find(item=>item.key==='theatre')!;
    expect(theatre).toMatchObject({
      title:'Театр',
      kind:'event',
      date:'2026-10-03',
      startTime:'16:00',
      endTime:null,
      eventSubtype:'theatre_ordinary',
    });

    const departure=result.items.find(item=>item.key==='theatre-departure')!;
    expect(departure).toMatchObject({
      kind:'travel',
      startTime:'15:30',
      endTime:'16:00',
      relation:{type:'before',targetKey:'theatre'},
    });
  });

  it('propagates the contextual day and preserves the requested order before theatre',()=>{
    const result=parseErikaDiscourse(FULL,{today:'2026-10-02'});
    const gym=result.items.find(item=>item.key==='gym')!;
    const meal=result.items.find(item=>item.key==='meal')!;
    const call=result.items.find(item=>item.key==='call-dasha')!;

    expect(gym.date).toBe('2026-10-03');
    expect(gym.startTime).toBeNull();
    expect(gym.relation).toEqual({type:'before',targetKey:'theatre'});
    expect(meal.relation).toEqual({type:'after',targetKey:'gym'});
    expect(meal.constraints).toContainEqual({type:'before',targetKey:'theatre'});
    expect(call.date).toBe('2026-10-03');
    expect(call.startTime).toBeNull();
  });

  it('models the daughter trip as conditional on the actual theatre end',()=>{
    const result=parseErikaDiscourse(FULL,{today:'2026-10-02'});
    const daughter=result.items.find(item=>item.key==='daughter-trip')!;

    expect(daughter).toMatchObject({
      title:'Поехать к дочке',
      kind:'travel',
      date:'2026-10-03',
      startTime:null,
      endTime:null,
      relation:{type:'after_actual_end',targetKey:'theatre'},
      condition:'если освобожусь не поздно',
    });
  });

  it('does not classify the word theatre by itself as a performance',()=>{
    const result=parseErikaDiscourse('Сегодня театр в 18:00.',{today:'2026-10-02'});
    expect(result.items[0]).toMatchObject({eventSubtype:'theatre_ordinary',endTime:null});
  });

  it('uses explicit departure time instead of applying a default theatre buffer',()=>{
    const result=parseErikaDiscourse('Завтра театр в 16:00. Выйти в 15:10.',{today:'2026-10-02'});
    const departure=result.items.find(item=>item.kind==='travel')!;
    expect(departure.startTime).toBe('15:10');
  });

  it('clarifies only a genuinely unresolved reference and preserves the exact clause',()=>{
    const result=parseErikaDiscourse('Завтра позвонить Даше. После него поехать домой.',{today:'2026-10-02'});
    expect(result.ambiguities).toEqual(['После него поехать домой']);
    expect(result.uncoveredClauses).toEqual([]);
  });
});
