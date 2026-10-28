import {describe,expect,it} from 'vitest';
import {exportDeviceData,exportEmergencyRawData,inspectDeviceBackup,importDeviceData} from './data-portability';
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
    expect(inspectDeviceBackup(output)).toEqual({tasks:1,ideas:1,projects:0});
  });
  it('merges data safely, retains existing tasks/decisions and remains idempotent',()=>{
    const from=new Memory(),to=new Memory();
    seed(from,'Первая задача','import-1');
    from.setItem('lifeos:persona:idea-history:v2',JSON.stringify([{title:'Идея',status:'used'}]));
    seed(to,'Своя задача','local-2');
    const file=exportDeviceData(from);
    expect(importDeviceData(to,file)).toEqual({tasks:1,ideas:1,projects:0});
    expect(importDeviceData(to,file)).toEqual({tasks:0,ideas:0,projects:0});
    const merged=JSON.parse(to.getItem('life-os:local-runtime:v1')!);
    expect(merged.items).toHaveLength(2);
    expect(merged.items.find((x:any)=>x.id==='local-2').title).toBe('Своя задача');
    expect(merged.items.find((x:any)=>x.id==='import-1').title).toBe('Первая задача');
  });
  it('exports and merges independent Persona projects without replacing an existing project',()=>{
    const from=new Memory(),to=new Memory();
    const project={id:'persona-a',title:'Репетиция',contentType:'reel',sourceIdea:'Сцена',script:null,shootingPlan:null,editPlan:null,timeline:null,mediaAssets:[],cloudAssetRefs:[],processing:null,captions:null,socialCaptions:null,stage:'strategy',qa:null,createdAt:'2026-10-28T10:00:00.000Z',updatedAt:'2026-10-28T10:00:00.000Z',schemaVersion:1,revision:1,lastOpenStep:'assets'};
    from.setItem('lifeos:persona:projects:v1',JSON.stringify({schemaVersion:1,activeProjectId:'persona-a',projects:[project]}));
    to.setItem('lifeos:persona:projects:v1',JSON.stringify({schemaVersion:1,activeProjectId:'local-only',projects:[{...project,id:'local-only',title:'Локальный проект'}]}));

    const backup=exportDeviceData(from);

    expect(inspectDeviceBackup(backup)).toMatchObject({projects:1});
    expect(importDeviceData(to,backup)).toMatchObject({projects:1});
    expect(importDeviceData(to,backup)).toMatchObject({projects:0});
    const restored=JSON.parse(to.getItem('lifeos:persona:projects:v1')!);
    expect(restored.projects.map((item:any)=>item.id)).toEqual(['local-only','persona-a']);
    expect(restored.projects.find((item:any)=>item.id==='persona-a').lastOpenStep).toBe('assets');
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
  it('preserves raw corrupted data without parsing it and never exports unrelated secrets',()=>{
    const s=new Memory();
    s.setItem('life-os:local-runtime:v1','{damaged-json');
    s.setItem('github_token','must-not-export');
    expect(()=>exportDeviceData(s)).toThrow();
    const emergency=JSON.parse(exportEmergencyRawData(s));
    expect(emergency.rawLocalTasks).toBe('{damaged-json');
    expect(emergency.kind).toBe('life-os-raw-recovery');
    expect(JSON.stringify(emergency)).not.toContain('must-not-export');
    expect(()=>inspectDeviceBackup(JSON.stringify(emergency))).toThrow('совместимой');
    expect(s.getItem('life-os:local-runtime:v1')).toBe('{damaged-json');
  });

  it('keeps corrupt Persona project JSON in an emergency archive without exposing unrelated keys',()=>{
    const s=new Memory();
    s.setItem('lifeos:persona:projects:v1','{damaged-projects');
    s.setItem('supabase_access_token','must-not-export');

    const emergency=JSON.parse(exportEmergencyRawData(s));

    expect(emergency.rawPersonaProjects).toBe('{damaged-projects');
    expect(JSON.stringify(emergency)).not.toContain('must-not-export');
  });

  it('rejects oversized file and a plan referencing an absent task',()=>{
    const x=new Memory();
    const payload=JSON.parse(exportDeviceData(x));
    payload.state.plans['bad']=['not-present'];
    expect(()=>importDeviceData(x,JSON.stringify(payload))).toThrow('отсутствующую');
    expect(()=>inspectDeviceBackup(' '.repeat(2_000_001))).toThrow('2 МБ');
  });
});
