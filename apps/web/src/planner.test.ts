import{describe,expect,it}from'vitest';import{planCompound}from'./planner';import type{Item}from'./types';

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

  it('keeps a transition buffer after occupied time when planning policy requires it',()=>{
    const result=planCompound('покататься на велосипеде 30 минут',[item('busy','10:00','11:00')],localTime(10),{transitionBufferMin:15});
    expect(result[0]).toMatchObject({start:'11:15',end:'11:45',durationMin:30});
  });

  it('can prioritize a matching untimed draft without changing the requested task set',()=>{
    const result=planCompound('почта 30 минут, музыка 30 минут',[item('busy','10:00','11:00')],localTime(10),{priorityTerms:['музыка']});
    expect(result.map(x=>x.title)).toEqual(['музыка','почта']);
    expect(result[0]).toMatchObject({start:'11:00',end:'11:30'});
    expect(result[1]).toMatchObject({start:'11:30',end:'12:00'});
  });
});
