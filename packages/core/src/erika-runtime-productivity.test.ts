import { describe, expect, it } from "vitest";
import type { AutonomyEngine } from "./engine";
import type { LifeItem } from "./life-item";
import { ErikaRuntime } from "./erika-runtime";

const items:LifeItem[]=[
  {
    id:"theatre",
    kind:"event",
    title:"Театр",
    status:"planned",
    plannedStart:"2026-10-02T16:00:00+03:00",
    plannedEnd:null,
    actualStart:null,
    actualEnd:null,
    projectId:null,
    version:1,
    createdAt:"2026-10-02T08:00:00+03:00",
    updatedAt:"2026-10-02T08:00:00+03:00",
  },
  {
    id:"gym",
    kind:"habit",
    title:"Зал",
    status:"missed_time",
    plannedStart:"2026-10-02T10:00:00+03:00",
    plannedEnd:"2026-10-02T11:00:00+03:00",
    actualStart:null,
    actualEnd:null,
    projectId:null,
    version:2,
    createdAt:"2026-10-02T08:00:00+03:00",
    updatedAt:"2026-10-02T11:00:00+03:00",
  },
];

describe("ErikaRuntime productivity focus",()=>{
  it("answers a focus question from the productivity digest without trying to mutate an item",async()=>{
    let findCalls=0;
    const runtime=new ErikaRuntime({} as AutonomyEngine,{
      findItem:async()=>{findCalls+=1; return null;},
      today:()=>"2026-10-02",
      tomorrow:()=>"2026-10-03",
      now:()=>"2026-10-02T12:00:00+03:00",
      listItems:async()=>items,
      consecutiveMissesByItem:async()=>({gym:2}),
    });

    const result=await runtime.execute("Что держим в поле?");

    expect(result.understood).toBe(true);
    expect(result.message).toContain("Театр");
    expect(result.message).toContain("минимальную версию");
    expect(findCalls).toBe(0);
    expect(result.audit).toBeUndefined();
  });
});
