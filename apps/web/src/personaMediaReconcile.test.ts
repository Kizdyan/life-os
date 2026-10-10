import {describe,expect,it} from "vitest";
import {currentSessionAssets,pendingServerAssets} from "./personaMediaReconcile";
import type {CreativeMediaMetadata} from "./personaMediaIntake";

const asset:CreativeMediaMetadata={
 id:"asset001",projectId:"project",contentItemId:"content",ideaId:"idea",
 ideaVersion:2,sessionId:"session",filename:"recording.mp4",mime:"video/mp4",
 bytes:1500,kind:"take",storage:"device_local",state:"INTAKE_LOCAL",
 createdAt:"2026-10-10T00:00:00Z",role:"primary_take",roleConfidence:"low"
};
const scope={projectId:"project",contentItemId:"content",ideaId:"idea",ideaVersion:2,sessionId:"session"};
describe("Persona offline manifests reconcile safely after browser reload",()=>{
 it("never shows stale files from a different idea, revision or shooting session",()=>{
  const prior={...asset,id:"prior",sessionId:"old"};
  const other={...asset,id:"other",ideaId:"another"};
  const oldRevision={...asset,id:"revision",ideaVersion:1};
  expect(currentSessionAssets([prior,other,oldRevision,asset,asset],scope)).toEqual([asset]);
  expect(currentSessionAssets([asset],{...scope,sessionId:"brand-new"})).toEqual([]);
 });
 it("only retries each committed asset ID once and is server-idempotent",()=>{
  expect(pendingServerAssets([asset,asset],[],scope)).toEqual([asset]);
  expect(pendingServerAssets([asset],[{id:asset.id}],scope)).toEqual([]);
 });
 it("never reattaches another session, signed version or content item",()=>{
  for(const key of ["sessionId","ideaVersion","projectId","contentItemId","ideaId"] as const){
   expect(pendingServerAssets([{...asset,[key]:"other"}],[],scope)).toEqual([]);
  }
 });
 it("requires a durable device-local committed manifest",()=>{
  expect(pendingServerAssets([{...asset,state:"QA_PENDING"} as unknown as CreativeMediaMetadata],[],scope))
   .toEqual([]);
 });
 it("sends missing alternate takes without duplicate primary metadata",()=>{
  const alt={...asset,id:"asset002",role:"alternate_take" as const};
  expect(pendingServerAssets([asset,alt],[{id:asset.id}],scope)).toEqual([alt]);
 });
});
