import { describe, expect, it } from "vitest";
import type { LifeItem } from "./life-item";
import { buildProductivityDigest } from "./productivity-digest";
function item(id:string,overrides:Partial<LifeItem>={}):LifeItem{return{id,kind:"task",title:id,status:"planned",plannedStart:null,plannedEnd:null,actualStart:null,actualEnd:null,projectId:null,version:1,createdAt:"2026-10-01T08:00:00+03:00",updatedAt:"2026-10-01T08:00:00+03:00",...overrides};}
describe("Erika productivity digest",()=>{
 it("pairs attention exceptions with recovery actions",()=>{const d=buildProductivityDigest({now:"2026-10-01T12:00:00+03:00",items:[item("gym",{kind:"habit",title:"Зал",status:"missed_time"})],consecutiveMissesByItem:{gym:1}});expect(d.attention.visible[0].itemId).toBe("gym");expect(d.recovery[0]).toMatchObject({itemId:"gym",action:"retry_soon",shouldAutoSchedule:true});});
 it("never silently reschedules a missed fixed event",()=>{const d=buildProductivityDigest({now:"2026-10-01T12:00:00+03:00",items:[item("show",{kind:"event",title:"Спектакль",status:"missed_time"})],consecutiveMissesByItem:{show:1}});expect(d.recovery[0]).toMatchObject({action:"review_fixed",shouldAutoSchedule:false});});
 it("keeps far-future planned items out of the attention view",()=>{const d=buildProductivityDigest({now:"2026-10-01T12:00:00+03:00",items:[item("today",{kind:"event",plannedStart:"2026-10-01T14:00:00+03:00"}),item("later",{plannedStart:"2026-10-08T14:00:00+03:00"})],consecutiveMissesByItem:{}});expect(d.attention.visible.map(x=>x.itemId)).toEqual(["today"]);});
});
