import{describe,expect,it}from'vitest';import{planCompound,parseExactTimeRange,planLocalDate,planLocalDateTime}from'./planner';import type{Item}from'./types';

const item=(id:string,start:string,end:string):Item=>({id,title:id,kind:'event',status:'planned',planned_start:`2026-10-02T${start}:00+03:00`,planned_end:`2026-10-02T${end}:00+03:00`});
const localTime=(hour:number,minute=0)=>new Date(2026,9,2,hour,minute,0,0);

describe('planCompound flexible placement',()=>{
  it('places an unscheduled 30 minute block into the next free 15 minute slot',()=>{
    const result=planCompound('покататься на велосипеде 30 минут',[item('busy','10:00','11:00')],localTime(10));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({start:'11:00',end:'11:30',durationMin:30});
  });

  it('skips occupied windows instead of leaving a flexible block unscheduled',()=>{
    const result=planCompound('зал 60 минут',[item('busy-1','09:00','10:00'),item('busy-2','10:30','12:00')],localTime(9));
    expect(result[0]).toMatchObject({start:'12:00',end:'13:00',durationMin:60});
  });

  it('keeps an item unscheduled only when no valid slot exists before the day boundary',()=>{
    const result=planCompound('дело 30 минут',[],localTime(22,45));
    expect(result[0].start).toBeUndefined();
    expect(result[0].end).toBeUndefined();
  });
});

describe('Erika explicit schedule command', () => {
  it('preserves an exact range instead of snapping to current time', () => {
    expect(parseExactTimeRange('Сегодня с 22:30 до 23:00 снять пробный рилс')).toEqual({
      title:'снять пробный рилс',start:'22:30',end:'23:00',dayOffset:0,
    });
  });
  it('understands a next-day exact range', () => {
    expect(parseExactTimeRange('Завтра с 11:00 до 11:30 снять рилс')).toEqual({
      title:'снять рилс',start:'11:00',end:'11:30',dayOffset:1,
    });
    expect(planLocalDate(new Date(2026,9,26,23,50),1)).toBe('2026-10-27');
  });
  it('does not invent dates from existing unrelated tasks', () => {
    expect(planLocalDate(new Date(2026,9,26,23,50))).toBe('2026-10-26');
  });
  it('rejects reversed times, invalid hours and empty task title', () => {
    expect(()=>parseExactTimeRange('Сегодня с 23:00 до 22:30 снять рилс')).toThrow('Проверь');
    expect(()=>parseExactTimeRange('Сегодня с 25:00 до 26:00 снять рилс')).toThrow('Проверь');
    expect(()=>parseExactTimeRange('Сегодня с 22:30 до 23:00')).toThrow('Напиши');
  });
  it('preserves user-local wall clock in ISO instead of hardcoding +03:00', () => {
    const formatted=planLocalDateTime('2026-10-26','22:30');
    expect(formatted.startsWith('2026-10-26T22:30:00')).toBe(true);
    expect(formatted).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});
