import { describe, expect, it } from "vitest";
import type { LifeItem } from "./life-item";
import { buildAttentionDigest } from "./attention-load";

function item(id:string, overrides:Partial<LifeItem>={}):LifeItem { return {id,kind:"task",title:id,status:"planned",plannedStart:null,plannedEnd:null,actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:"2026-10-01T08:00:00+03:00",updatedAt:"2026-10-01T08:00:00+03:00",...overrides}; }

describe("Cognitive Load Guard",()=>{
  it("shows exceptions and near-term commitments instead of the whole database",()=>{
    const result=buildAttentionDigest({now:"2026-10-01T12:00:00+03:00",items:[
      item("missed",{status:"missed_time"}),
      item("moved",{status:"moved"}),
      item("soon",{kind:"event",plannedStart:"2026-10-01T14:00:00+03:00"}),
      item("later",{plannedStart:"2026-10-05T14:00:00+03:00"})]});
    expect(result.visible.map(x=>x.itemId)).toEqual(["soon","missed","moved"]);
    expect(result.visible.some(x=>x.itemId==="later")).toBe(false);
  });
  it("caps visible open loops and reports the hidden remainder",()=>{
    const result=buildAttentionDigest({now:"2026-10-01T12:00:00+03:00",maxVisible:2,items:[item("a",{status:"missed_time"}),item("b",{status:"moved"}),item("c",{status:"not_completed"}),item("d",{status:"missed_time"})]});
    expect(result.visible).toHaveLength(2); expect(result.hiddenCount).toBe(2); expect(result.needsConsolidation).toBe(true);
  });
  it("labels load as a configurable heuristic, not a clinical assessment",()=>{
    const result=buildAttentionDigest({now:"2026-10-01T12:00:00+03:00",policy:{mediumAt:2,highAt:4,dueSoonHours:24},items:[item("a",{status:"missed_time"}),item("b",{status:"moved"}),item("c",{status:"not_completed"}),item("d",{status:"missed_time"})]});
    expect(result.load).toBe("high"); expect(result.isClinicalAssessment).toBe(false);
  });
});
