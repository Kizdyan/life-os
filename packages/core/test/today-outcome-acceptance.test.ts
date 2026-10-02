import{describe,it,expect}from'vitest';import{LifeSetOutcomeTool}from'../src/outcome-tool';

const kinds=['routine','meal','task','event','habit','travel','recovery'] as const;

describe('Today ✓/× acceptance',()=>{
  for(const kind of kinds){
    it(`${kind} persists complete and not_complete`,async()=>{
      for(const command of ['complete','not_complete'] as const){
        let committed:any;
        const item:any={id:kind,title:kind,kind,status:'planned',version:1,carryForward:false};
        const repo:any={get:async()=>item,commit:async(value:any)=>{committed=value}};
        const tool=new LifeSetOutcomeTool(repo,()=> '2026-10-02T12:00:00+03:00');
        await tool.execute({id:'acceptance',type:'life.set_outcome',input:{itemId:kind,command,plannedDate:'2026-10-02',source:'ui',carryForward:false}} as any);
        expect(committed.current.status).toBe(command==='complete'?'completed':'not_completed');
      }
    });
  }
});
