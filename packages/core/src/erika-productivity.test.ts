import { describe, expect, it } from "vitest";
import type { LifeItem } from "./life-item";
import {
  buildErikaProductivityReply,
  isProductivityFocusQuestion,
} from "./erika-productivity";

function item(id:string, overrides:Partial<LifeItem>={}):LifeItem {
  return {
    id,
    kind:"task",
    title:id,
    status:"planned",
    plannedStart:null,
    plannedEnd:null,
    actualStart:null,
    actualEnd:null,
    projectId:null,
    version:1,
    createdAt:"2026-10-02T08:00:00+03:00",
    updatedAt:"2026-10-02T08:00:00+03:00",
    ...overrides,
  };
}

describe("Erika productivity focus",()=>{
  it("recognizes focus questions without confusing them with outcome commands",()=>{
    expect(isProductivityFocusQuestion("Что держим в поле?")).toBe(true);
    expect(isProductivityFocusQuestion("На чём мне сейчас сосредоточиться?")).toBe(true);
    expect(isProductivityFocusQuestion("Я сделал зал")).toBe(false);
  });

  it("returns only the most relevant open loops and mentions hidden remainder",()=>{
    const reply=buildErikaProductivityReply({
      now:"2026-10-02T12:00:00+03:00",
      maxVisible:2,
      consecutiveMissesByItem:{gym:1},
      items:[
        item("theatre",{kind:"event",title:"Театр",plannedStart:"2026-10-02T14:00:00+03:00"}),
        item("gym",{kind:"habit",title:"Зал",status:"missed_time"}),
        item("call",{title:"Позвонить Даше",status:"moved"}),
        item("later",{title:"Поздняя задача",plannedStart:"2026-10-07T18:00:00+03:00"}),
      ],
    });

    expect(reply).toContain("Театр");
    expect(reply).toContain("Зал");
    expect(reply).not.toContain("Поздняя задача");
    expect(reply).toContain("ещё 1");
  });

  it("explains recovery action after a repeated miss without pretending it already executed",()=>{
    const reply=buildErikaProductivityReply({
      now:"2026-10-02T12:00:00+03:00",
      consecutiveMissesByItem:{gym:2},
      items:[item("gym",{kind:"habit",title:"Зал",status:"missed_time"})],
    });

    expect(reply).toContain("Зал");
    expect(reply).toContain("минимальную версию");
    expect(reply).not.toContain("перенесла");
  });
});
