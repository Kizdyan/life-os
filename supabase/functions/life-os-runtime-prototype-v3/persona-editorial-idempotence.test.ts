import {describe,expect,it} from "vitest";
import {creativeShortlist,editorialAssessment} from "./persona-creative-core.ts";
const now=Date.parse("2026-10-09T12:00:00Z");
describe("Erika revised ending always replaces instead of appending",()=>{
 it("repeated identical ending never creates a third proposal or duplicates a phrase",()=>{
  const [idea]=creativeShortlist(now);
  const initial=String(idea.script);
  const v2=editorialAssessment(idea,"мне нравится идея 2, но поменяй финал");
  expect(v2.proposal).not.toBeNull();
  const text=String(v2.proposal?.script);
  expect(text).not.toBe(initial);
  expect(text.split("А финал оставим открытым:").length-1).toBe(1);
  const repeated=editorialAssessment(v2.proposal!,"поменяй финал");
  expect(repeated.kind).toBe("NO_CHANGE");
  expect(repeated.proposal).toBeNull();
 });
 it("a different requested ending replaces the previous ending in place",()=>{
  const [idea]=creativeShortlist(now);
  const first=editorialAssessment(idea,"поменяй финал").proposal!;
  const second=editorialAssessment(first,"поменяй финал на В последний момент герой рассмеялся.");
  expect(second.proposal).not.toBeNull();
  const text=String(second.proposal?.script);
  expect(text).toContain("В последний момент герой рассмеялся.");
  expect(text).not.toContain("А финал оставим открытым:");
 });
 it("humorous ending changes the ending itself, rather than hiding a generic open question",()=>{
  const [idea]=creativeShortlist(now);
  const humorous=editorialAssessment(idea,"сделай финал смешнее");
  expect(humorous.kind).toBe("ENDING");
  expect(String(humorous.proposal?.script)).toContain("просит дублёра");
  expect(String(humorous.proposal?.script)).not.toContain("А финал оставим открытым");
  expect(editorialAssessment(humorous.proposal!,"сделай финал смешнее").kind).toBe("NO_CHANGE");
  expect(editorialAssessment(humorous.proposal!,"не меняй финал").proposal).toBeNull();
 });
 it("asks for the missing text rather than quietly applying a generic ending",()=>{
  const [idea]=creativeShortlist(now);
  const result=editorialAssessment(idea,"поменяй финал на");
  expect(result.judge).toBe("REVISE");
  expect(result.proposal).toBeNull();
 });
 it("honors a combined opinion and explicit editing request",()=>{
  const [idea]=creativeShortlist(now);
  const result=editorialAssessment(idea,"как считаешь, поменяй финал на Герой вдруг улыбнулся.");
  expect(result.kind).toBe("ENDING");
  expect(String(result.proposal?.script)).toContain("Герой вдруг улыбнулся.");
 });
 it("humor and tone revisions never repeat the same addendum",()=>{
  const [idea]=creativeShortlist(now);
  const humorous=editorialAssessment(idea,"сделай смешнее").proposal!;
  expect(editorialAssessment(humorous,"сделай смешнее").proposal).toBeNull();
  const natural=editorialAssessment(idea,"без пафоса").proposal!;
  expect(editorialAssessment(natural,"без пафоса").proposal).toBeNull();
 });
});