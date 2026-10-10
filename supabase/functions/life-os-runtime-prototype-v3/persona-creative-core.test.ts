import {describe,expect,it} from "vitest";
import {creativeShortlist,editorialAssessment,adaptCreativeBrief,validateIntakeAsset} from "./persona-creative-core.ts";
import {sealApprovedIdea,verifyApproval} from "./persona-brain.ts";
import {validatePersonaShootingBrief} from "./quality-gates.ts";
const at=Date.parse("2026-10-09T12:00:00.000Z");
const signingKey="test-only-creative-v1-key";
describe("Creative Loop V1 bounded FREE_ONLY core",()=>{
 it("has precisely three editorially distinct candidates and no paid model",()=>{
  const ideas=creativeShortlist(at);
  expect(ideas).toHaveLength(3);
  expect(new Set(ideas.map(i=>i.id)).size).toBe(3);
  expect(ideas.map(i=>i.title)).toEqual([
    "Одна фраза — три совершенно разных персонажа",
    "Один аккорд — три настроения",
    "30 секунд до выхода на сцену"]);
  expect(ideas.every(i=>i.evidenceKind==="EDITORIAL_PLATFORM_GUIDANCE_NOT_LIVE_TREND" && Number(i.estimatedMinutes)<=15)).toBe(true);
  expect(creativeShortlist(Date.parse("2026-11-01T00:00:00.000Z"))).toHaveLength(3);
  expect(creativeShortlist(Date.parse("2027-04-07T00:00:01.000Z"))).toEqual([]);
 });
 it("keeps semantic revision approval separate, with Critic and Judge",async()=>{
  const [idea]=creativeShortlist(at);
  const v1=await sealApprovedIdea({...idea,creativeVersion:1},signingKey,at);
  const proposal=editorialAssessment(v1.idea,"мне нравится, но поменяй финал на Герой неожиданно улыбнулся.");
  expect(proposal.kind).toBe("ENDING");
  expect(proposal.proposal?.script).not.toBe(v1.idea.script);
  expect(proposal.critic).toMatch(/финал|вовлекает/);
  expect(proposal.judge).toBe("APPROVE");
  const changed={...proposal.proposal,creativeVersion:2};
  // Editing does not inherit v1's proof: a separate signature is required.
  const v2=await sealApprovedIdea(changed,signingKey,at+60_000);
  expect(v2.approvalProof).not.toBe(v1.approvalProof);
  expect((await verifyApproval(v2.approvalProof,signingKey,at+60_000))?.idea.creativeVersion).toBe(2);
  expect(editorialAssessment(v1.idea,"что думаешь о моей правке?").proposal).toBeNull();
  expect(editorialAssessment(v1.idea,"добавь неопределённую магию").judge).toBe("REVISE");
 });
 it("makes shooting conditions genuinely change a validated brief",()=>{
  const [idea]=creativeShortlist(at);
  const brief=adaptCreativeBrief(idea,"нет штатива, плохой свет, снимаю один, есть 7 минут, дома");
  expect(validatePersonaShootingBrief(brief)).toEqual([]);
  expect(String(brief.lighting)).toContain("окну");
  expect(String((brief.shots as Array<{cameraPosition:string}>)[0].cameraPosition)).toContain("полке");
  expect((brief.shots as Array<{takes:number}>)[0].takes).toBe(1);
  expect(()=>adaptCreativeBrief(idea,"только 2 минуты")).toThrow("shooting_time_too_short");
  for (const words of ["нет помощника", "без оператора", "нету помощника, снимаю один"]){
    const solo=adaptCreativeBrief(idea,words);
    expect(validatePersonaShootingBrief(solo)).toEqual([]);
    const shot=(solo.shots as Array<{cameraPosition:string;action:string}>)[0];
    expect(shot.cameraPosition).not.toContain("Помощник держит");
    expect(shot.action).toContain("Снять одному");
  }
  const withHelper=adaptCreativeBrief(idea,"есть помощник");
  expect(String((withHelper.shots as Array<{cameraPosition:string}>)[0].cameraPosition))
    .toContain("Помощник держит");
 });
 it("requires immutable asset lineage and pending future-pipeline metadata",()=>{
  const a=validateIntakeAsset({id:"aabbccddeeff0011",projectId:"project",contentItemId:"content",
   ideaId:"idea",ideaVersion:2,sessionId:"shoot:id",kind:"broll",filename:"scene.mov",
   mime:"video/quicktime",bytes:1024,storage:"device_local"});
  expect(a.pipeline.transcription).toBe("PENDING");
  expect(a.storage).toBe("device_local");
  expect(a.ideaVersion).toBe(2);
  expect(()=>validateIntakeAsset({...a,filename:"../bad.mov"})).toThrow("invalid_asset");
  expect(()=>validateIntakeAsset({...a,bytes:0})).toThrow("invalid_asset");
 });
});
