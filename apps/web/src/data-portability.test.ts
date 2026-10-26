import {describe,expect,it} from 'vitest';
import {exportDeviceData,inspectDeviceBackup,importDeviceData} from './data-portability';
import {applyLocalPlan,applyLocalOutcome} from './localRuntime';
class Memory {
  values=new Map<string,string>();
  getItem(key:string){return this.values.get(key)??null}
  setItem(key:string,value:string){this.values.set(key,value)}
  removeItem(key:string){this.values.delete(key)}
}
function seed(s:Memory,title:string,id:string){
  const plan=applyLocalPlan(s,'plan:'+id,[{title,planned_start:'2026-10-26T22:30:00+03:00',
    planned_end:'2026-10-26T23:00:00+03:00'}],()=>id);
  return plan;
}
describe('portable local Life OS + Persona backup',()=>{
  it('exports existing task status and Persona history, never unrelated secrets',()=>{
    const store=new Memory();
    seed(store,'Снять рилс','one');
    const item=JSON.parse(store.getItem('life-os:local-runtime:v1')!).items[0];
    applyLocalOutcome(store,item,'complete',()=> 'unused');
    store.setItem('lifeos:persona:idea-history:v2',JSON.stringify([{title:'Сценарий',status:'used'}]));
    store.setItem('github_token','DO-NOT-EXPORT');
    store.setItem('life-os:web-outbox','SENSITIVE-OUTBOX');
    const output=exportDeviceData(store);
    expect(output).toContain('"status": "completed"');
    expect(output).toContain('Сценарий');
    expect(output).not.toContain('DO-NOT-EXPORT');
    expect(output).not.toContain('SENSITIVE-OUTBOX');
    expect(inspectDeviceBackup(output)).toEqual({tasks:1,ideas:1});
  });
  it('merges data safely, retains existing tasks/decisions and remains idempotent',()=>{
    const from=new Memory(),to=new Memory();
    seed(from,'Первая задача','import-1');
    from.setItem('lifeos:persona:idea-history:v2',JSON.stringify([{title:'Идея',status:'used'}]));
    seed(to,'Своя задача','local-2');
    const file=exportDeviceData(from);
    expect(importDeviceData(to,file)).toEqual({tasks:1,ideas:1});
    expect(importDeviceData(to,file)).toEqual({tasks:0,ideas:0});
    const merged=JSON.parse(to.getItem('life-os:local-runtime:v1')!);
    expect(merged.items).toHaveLength(2);
    expect(merged.items.find((x:any)=>x.id==='local-2').title).toBe('Своя задача');
    expect(merged.items.find((x:any)=>x.id==='import-1').title).toBe('Первая задача');
  });
  it('rejects arbitrary JSON and malformed tasks without modifying current state',()=>{
    const dest=new Memory();
    seed(dest,'Сохрани меня','safe-task');
    const before=dest.getItem('life-os:local-runtime:v1');
    expect(()=>importDeviceData(dest,JSON.stringify({access_token:'fake'}))).toThrow();
    const payload=JSON.parse(exportDeviceData(dest));
    payload.state.items[0].status='injected';
    expect(()=>importDeviceData(dest,JSON.stringify(payload))).toThrow('статус');
    expect(dest.getItem('life-os:local-runtime:v1')).toBe(before);
  });
  it('rejects oversized file and a plan referencing an absent task',()=>{
    const x=new Memory();
    const payload=JSON.parse(exportDeviceData(x));
    payload.state.plans['bad']=['not-present'];
    expect(()=>importDeviceData(x,JSON.stringify(payload))).toThrow('отсутствующую');
    expect(()=>inspectDeviceBackup(' '.repeat(2_000_001))).toThrow('2 МБ');
  });
});
