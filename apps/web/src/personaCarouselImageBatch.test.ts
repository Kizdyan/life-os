import {describe,it,expect} from 'vitest';
import {importResearchCarousel,RESEARCH_CAROUSEL_EXAMPLE} from './personaResearchCarousel';
import {libraryBackground} from './personaEditorialBackgrounds';
import {generateMissingAutonomousBackgrounds,missingAutonomousBackgrounds} from './personaCarouselImageBatch';
import {reviseEditorialPost,type EditorialPost} from './personaEditorialModel';

const now='2026-11-25T02:00:00.000Z';
function draft(){
 const packet=structuredClone(RESEARCH_CAROUSEL_EXAMPLE);
 packet.slides.forEach(s=>s.visualDirection='Крупный план, конкретная деталь.');
 return importResearchCarousel('research-batch-226',JSON.stringify(packet),now,{mode:'discover',model:'test-model',receivedAt:now});
}
function asset(i:number){return {...libraryBackground(i),generatedRef:'research-batch-226/bg-'+i,
 sha256:String(i+1).repeat(64),provenance:{provider:'openai' as const,model:'test-model',prompt:'test-only',createdAt:now}}}
const ok=(i:number)=>({status:'READY' as const,background:asset(i),message:'fixture'});
describe('bounded draft image batch',()=>{
 it('persists each successful result, stops on a blocked request, resumes missing images without repeats',async()=>{
  let current=draft();const calls:number[]=[];
  const readCurrent=()=>current,persist=(p:EditorialPost)=>{current=p};
  const first=await generateMissingAutonomousBackgrounds({post:current,authorizedCalls:5,readCurrent,persist,
   generate:async(_p,i)=>{calls.push(i);return i===2?{status:'BLOCKED',message:'fixture failure'}:ok(i)}});
  expect(first).toMatchObject({status:'BLOCKED',attempted:3,completed:2});
  expect(missingAutonomousBackgrounds(current)).toEqual([2,3,4]);
  const resumed=await generateMissingAutonomousBackgrounds({post:current,authorizedCalls:3,readCurrent,persist,
   generate:async(_p,i)=>{calls.push(i);return ok(i)}});
  expect(resumed).toMatchObject({status:'READY',attempted:3,completed:3});
  expect(calls).toEqual([0,1,2,2,3,4]);
  expect(current.approvals).toMatchObject({topic:false,content:false,design:false});
  expect(current.research?.sourceItems.every(s=>!s.reviewed)).toBe(true);
  expect(current.slides.map(s=>s.text)).toEqual(draft().slides.map(s=>s.text));
 });
 it('refuses partial or excessive authorization without calling the provider',async()=>{
  const p=draft();let calls=0;
  for(const authorizedCalls of [0,4,6,9]){
   await expect(generateMissingAutonomousBackgrounds({post:p,authorizedCalls,readCurrent:()=>p,persist:()=>{},
    generate:async()=>{calls++;return ok(0)}})).rejects.toThrow(/согласие/);
  }
  expect(calls).toBe(0);
 });
 it('does not overwrite a revision changed while an image request is in flight',async()=>{
  let p=draft(),calls=0,saves=0;
  await expect(generateMissingAutonomousBackgrounds({post:p,authorizedCalls:5,readCurrent:()=>p,persist:()=>{saves++},
   generate:async()=>{calls++;p=reviseEditorialPost(p,{caption:'Другая редакция'});return ok(0)}})).rejects.toThrow(/изменилась/);
  expect(calls).toBe(1);expect(saves).toBe(0);
 });
 it('does not spend further calls on unconfirmed storage or duplicate assets',async()=>{
  let p=draft(),calls=0;
  await expect(generateMissingAutonomousBackgrounds({post:p,authorizedCalls:5,readCurrent:()=>p,persist:()=>{},
   generate:async()=>{calls++;return ok(0)}})).rejects.toThrow(/сохранение/);
  expect(calls).toBe(1);
  const result=await generateMissingAutonomousBackgrounds({post:p,authorizedCalls:5,readCurrent:()=>p,persist:n=>{p=n},
   generate:async()=>ok(0)});
  expect(result).toMatchObject({status:'BLOCKED',attempted:2,completed:1});
 });
 it('preserves manual posts and refuses replacing an existing archive or library image',()=>{
  const p=draft();
  expect(()=>missingAutonomousBackgrounds({...p,research:{...p.research!,provider:'manual',discovery:undefined}})).toThrow();
  expect(()=>missingAutonomousBackgrounds({...p,slides:p.slides.map((s,i)=>i===0?{...s,background:libraryBackground(0)}:s)})).toThrow();
  expect(()=>missingAutonomousBackgrounds({...p,slides:p.slides.map((s,i)=>i===0?{...s,visual:'archive-photo'}:s)})).toThrow();
 });
});
