import {describe,expect,it} from "vitest";
import {inferMediaRole} from "./personaMediaRoles";
const file=(name:string,type:string)=>({name,type});
describe("Persona automatic intake roles",()=>{
 it("first unsorted video is primary, subsequent video is alternate",()=>{
  const first=inferMediaRole(file("IMG_0001.MOV","video/quicktime"),[]);
  const second=inferMediaRole(file("IMG_0002.MOV","video/quicktime"),[first]);
  expect(first.role).toBe("primary_take");
  expect(second.role).toBe("alternate_take");
  expect(second.kind).toBe("take");
 });
 it("spots B-roll/reference/image/audio by metadata without user classification",()=>{
  expect(inferMediaRole(file("detail_broll.mov","video/quicktime"),[]).role).toBe("broll");
  expect(inferMediaRole(file("portrait.HEIC","image/heic"),[]).role).toBe("photo");
  expect(inferMediaRole(file("voice.m4a","audio/mp4"),[]).role).toBe("audio");
  expect(inferMediaRole(file("reference_scene.pdf","application/pdf"),[]).role).toBe("reference_other");
  expect(inferMediaRole(file("misc.bin","application/octet-stream"),[]).role).toBe("reference_other");
 });
 it("does not mistake iPhone or microphone names for background clips",()=>{
  for(const name of ["айфон_0001.MOV","микрофон_0002.mp4","phone-video.mov"]){
   expect(inferMediaRole(file(name,"video/quicktime"),[]).role).toBe("primary_take");
  }
  expect(inferMediaRole(file("фон_сцены.mov","video/quicktime"),[]).role).toBe("broll");
  expect(inferMediaRole(file("clip_фон.mov","video/quicktime"),[]).role).toBe("broll");
 });
 it("offers optional override without silently treating guesses as verified content",()=>{
  const inferred=inferMediaRole(file("clip01.mp4","video/mp4"),[]);
  expect(inferred.confidence).toBe("low");
  const changed=inferMediaRole(file("clip01.mp4","video/mp4"),[],"broll");
  expect(changed.kind).toBe("broll");
  expect(changed.confidence).toBe("high");
 });
});