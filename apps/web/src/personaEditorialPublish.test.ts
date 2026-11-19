import {describe,it,expect} from 'vitest';
import {
 createBaselinePauseCarousel,createDirectorQuestionCarousel,createPhotoArchiveCarousel,createMixedNarrativeCarousel,
 approveEditorialStep,setEditorialChecklistItem,reviseEditorialPost
} from './personaEditorialModel';
import {
 PUBLICATION_CAROUSEL_IDS,UNAPPROVED_PUBLICATION_MESSAGE,publicationCarouselApproved,
 publicationEntries,buildSinglePublicationZip,buildAllPublicationZip,publicationFilename,
 type PublicationSlideRenderer
} from './personaEditorialPublish';

const sixPng=new Uint8Array(32);
sixPng.set([137,80,78,71,13,10,26,10]);
new DataView(sixPng.buffer).setUint32(16,1080,false);
new DataView(sixPng.buffer).setUint32(20,1350,false);
const fakeRenderer:PublicationSlideRenderer=async()=>new Blob([sixPng],{type:'image/png'});
const draftFactories=[
 createBaselinePauseCarousel,createDirectorQuestionCarousel,createPhotoArchiveCarousel,createMixedNarrativeCarousel
];
function approve(post:ReturnType<typeof createBaselinePauseCarousel>){
 let p=approveEditorialStep(approveEditorialStep(post,'topic'),'content');
 for(let i=0;i<(p.carouselFormat?5:6);i++)p=setEditorialChecklistItem(p,i,true);
 return approveEditorialStep(p,'design','2026-11-19T19:00:00Z');
}
async function unzipNames(zip:Blob){
 const bytes=new Uint8Array(await zip.arrayBuffer()),view=new DataView(bytes.buffer),names:string[]=[];
 let offset=0;
 while(offset+30<=bytes.length&&view.getUint32(offset,true)===0x04034b50){
  const len=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
  const size=view.getUint32(offset+18,true);
  names.push(new TextDecoder().decode(bytes.slice(offset+30,offset+30+len)));
  offset+=30+len+extra+size;
 }
 return names;
}
describe('Four-carousel publication package',()=>{
 it('creates exactly six PNGs, a clean caption, instructions and existing gate receipt',async()=>{
  const approved=approve(createBaselinePauseCarousel());
  const files=await publicationEntries(approved,fakeRenderer);
  expect(files.map(f=>f.name)).toEqual([
   ...Array.from({length:6},(_,i)=>approved.id+'/slide-'+String(i+1).padStart(2,'0')+'.png'),
   approved.id+'/caption.txt',approved.id+'/publish-instructions.txt',approved.id+'/checklist.json'
  ]);
  expect(new TextDecoder().decode(files[6].data)).toBe(approved.caption);
  expect(new TextDecoder().decode(files[7].data)).toMatch(/Instagram/);
  const gate=JSON.parse(new TextDecoder().decode(files[8].data));
  expect(gate).toMatchObject({status:'approved',published:false,slideCount:6,
   checkedBy:'Автор',contentHashAtApproval:approved.approvals.contentHashAtApproval});
  expect(gate.checks).toHaveLength(7);
  expect(gate.checks.every((item:{pass:boolean})=>item.pass)).toBe(true);
  const zip=await buildSinglePublicationZip(approved,fakeRenderer);
  expect(await unzipNames(zip)).toEqual(files.map(f=>f.name));
  expect(publicationFilename(approved.id as typeof PUBLICATION_CAROUSEL_IDS[number],
   new Date(2026,10,19))).toBe(approved.id+'-publish-2026-11-19.zip');
 });
 it('refuses incomplete and invalidated approvals before any PNG rendering',async()=>{
  let called=0;
  const counting:PublicationSlideRenderer=async(p,s,i)=>{called++;return fakeRenderer(p,s,i)};
  const drafts=draftFactories.map(f=>f());
  await expect(buildSinglePublicationZip(drafts[0],counting)).rejects.toThrow(UNAPPROVED_PUBLICATION_MESSAGE);
  await expect(buildAllPublicationZip(drafts,counting)).rejects.toThrow(UNAPPROVED_PUBLICATION_MESSAGE);
  const approved=draftFactories.map(f=>approve(f()));
  const edited=reviseEditorialPost(approved[2],{caption:'Новое авторское содержание'});
  await expect(buildAllPublicationZip([...approved.slice(0,2),edited,approved[3]],counting))
   .rejects.toThrow(UNAPPROVED_PUBLICATION_MESSAGE);
  expect(called).toBe(0);
  expect(publicationCarouselApproved(edited)).toBe(false);
 });
 it('uses explicit text-only fallback for both photo-led and mixed carousels',async()=>{
  for(const factory of [createPhotoArchiveCarousel,createMixedNarrativeCarousel]){
   const post=approve(factory());
   const files=await publicationEntries(post,fakeRenderer);
   expect(files).toHaveLength(9);
   expect(new TextDecoder().decode(files[7].data)).toContain(
    'Это текстовая версия. Чтобы добавить фотографии, выберите их в архиве Persona и утвердите заново.');
   expect(JSON.parse(new TextDecoder().decode(files[8].data)).textFallback).toBe(true);
  }
  const approved=draftFactories.map(f=>approve(f()));
  const all=await buildAllPublicationZip(approved,fakeRenderer);
  expect(await unzipNames(all)).toEqual(approved.flatMap(post=>[
   ...Array.from({length:6},(_,i)=>post.id+'/slide-'+String(i+1).padStart(2,'0')+'.png'),
   post.id+'/caption.txt',post.id+'/publish-instructions.txt',post.id+'/checklist.json']));
  expect(publicationFilename(null,new Date(2026,10,19))).toBe('persona-carousels-publish-2026-11-19.zip');
  expect(PUBLICATION_CAROUSEL_IDS).toHaveLength(4);
 });
});
