import {describe,it,expect} from 'vitest';
import {
 PERSONA_FREE_RESEARCH_KEY,normalizePersonaReferenceUrl,
 addPersonaFreeReference,readPersonaFreeReferences,exportPersonaFreeReferences
} from './personaFreeResearch';

describe('Persona zero-credit reference evidence',()=>{
 const now='2026-10-30T12:00:00Z';
 const original='https://www.instagram.com/reel/ABC123/?utm_source=copy_link&igshid=xyz';
 const create=(url=original)=>addPersonaFreeReference([],{
  url,title:'Смешная кинопроба',category:'acting',observation:'Хук на первой секунде: абсурдное условие',
  status:'human-reviewed'
 },now,'reference-1');

 it('normalizes safe public links and strips tracking tokens',()=>{
  expect(normalizePersonaReferenceUrl(original)).toBe('https://www.instagram.com/reel/ABC123/');
  expect(normalizePersonaReferenceUrl('https://youtu.be/xyz?si=tracking')).toBe('https://youtu.be/xyz');
 });
 it('rejects unsafe schemes, lookalike hosts, credentials and ports',()=>{
  for(const value of [
   'javascript:alert(1)','http://instagram.com/reel/a',
   'https://instagram.com.evil.example/reel/a',
   'https://user:password@instagram.com/reel/a',
   'https://instagram.com:444/reel/a',
   'file:///C:/secret.mp4'
  ])expect(()=>normalizePersonaReferenceUrl(value)).toThrow();
 });
 it('does not turn unviewed bookmarks into falsely reviewed evidence',()=>{
  const refs=addPersonaFreeReference([],{url:original,title:'Заголовок',category:'comedy'},now,'id');
  expect(refs[0].status).toBe('link-only');
  expect(refs[0].observation).toBe('');
  expect(()=>addPersonaFreeReference([],{
   url:original,title:'Заголовок',category:'comedy',
   status:'human-reviewed',observation:'круто'
  },now,'id')).toThrow(/наблюдение/);
 });
 it('does not duplicate previously normalized references',()=>{
  const refs=create();
  expect(()=>addPersonaFreeReference(refs,{
   url:'https://www.instagram.com/reel/ABC123/',title:'Иное название',
   category:'other'
  },now,'reference-2')).toThrow(/уже сохранена/);
 });
 it('rejects incorrect local data, but preserves actual saved evidence',()=>{
  const reference=create()[0];
  const storage={getItem:(key:string)=>key===PERSONA_FREE_RESEARCH_KEY?
   JSON.stringify([reference,{...reference,url:'https://evil.example/'}]):null};
  expect(readPersonaFreeReferences(storage)).toEqual([reference]);
  expect(readPersonaFreeReferences({getItem:()=>'{broken'})).toEqual([]);
 });
 it('export includes evidence disclaimer but never fabricates views, engagement or verified claims',()=>{
  const exported=JSON.parse(exportPersonaFreeReferences(create()));
  expect(exported.kind).toBe('persona-free-reference-export-v1');
  expect(exported.references).toHaveLength(1);
  expect(exported.references[0].url).toBe('https://www.instagram.com/reel/ABC123/');
  expect(exported.evidenceNotice).toMatch(/not automatically watched/);
  expect(exported.references[0]).not.toHaveProperty('views');
  expect(exported.references[0]).not.toHaveProperty('engagementRate');
 });
});
