import { describe,expect,it } from 'vitest';
import { ErikaRuntime } from '../src/erika-runtime';

describe('ErikaRuntime',()=>{
  it('routes natural-language completion through the same action engine',async()=>{
    let action:any;
    const engine:any={run:async(a:any)=>{action=a;return {state:'verified'}}};
    const context:any={today:()=> '2026-09-30',tomorrow:()=> '2026-10-01',findItem:async()=>({id:'music',title:'Теория музыки',plannedDate:'2026-09-30'})};
    const result=await new ErikaRuntime(engine,context).execute('Теорию музыки сделал');
    expect(action.tool).toBe('life.set_outcome');
    expect(action.input.source).toBe('erika');
    expect(action.input.command).toBe('complete');
    expect(result.message).toContain('выполнено');
  });

  it('keeps missed history and carries an unfinished item to tomorrow',async()=>{
    let action:any;
    const engine:any={run:async(a:any)=>{action=a;return {state:'verified'}}};
    const context:any={today:()=> '2026-09-30',tomorrow:()=> '2026-10-01',findItem:async()=>({id:'music',title:'Теория музыки',plannedDate:'2026-09-30'})};
    await new ErikaRuntime(engine,context).execute('Теорию музыки не сделал, перенеси на завтра');
    expect(action.input.command).toBe('not_complete');
    expect(action.input.carryForward).toBe(true);
    expect(action.input.nextDate).toBe('2026-10-01');
  });
});
