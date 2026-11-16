import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readActorPortfolios,addActorPortfolio,updateActorPortfolio} from './personaActorPortfolioStore';
import {makeMusicSyncPack,validateMusicSyncTrack,type MusicSyncTrack} from './personaMusicSyncDb';
import {buildPersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import PersonaActorPortfolio from './PersonaActorPortfolio';
import PersonaMusicSyncPortfolio from './PersonaMusicSyncPortfolio';

function storage(){
 const m=new Map<string,string>();
 return {getItem:(key:string)=>m.get(key)??null,setItem:(key:string,val:string)=>{m.set(key,val)}};
}
const track=():MusicSyncTrack=>({
 version:1,id:'track-001',title:'Тема для фильма',genre:'Драма',mood:'Тревожное',
 durationSec:94,stems:true,rightsOwner:'Автор музыки',rightsStatus:'unverified',
 trackUrl:'https://example.com/track/audio',createdAt:'2026-11-16T12:00:00.000Z',
 updatedAt:'2026-11-16T12:00:00.000Z',
});
describe('professional portfolio contracts',()=>{
 it('keeps separate actor portfolio projects with drafts, not fake approved renders',()=>{
  const mem=storage();
  const p=addActorPortfolio(mem,{id:'actor-1',title:'Художественная визитка',genre:'drama'});
  expect(p.durationSec).toBeGreaterThanOrEqual(30);
  expect(p.durationSec).toBeLessThanOrEqual(60);
  expect(p.publicationApproved).toBe(false);
  expect(readActorPortfolios(mem)).toHaveLength(1);
  expect(()=>addActorPortfolio(mem,{id:'actor-1',title:'Дубликат',genre:'comedy'})).toThrow();
  updateActorPortfolio(mem,{...p,title:'Новая редакция'});
  expect(readActorPortfolios(mem)[0].title).toBe('Новая редакция');
  mem.setItem('lifeos:persona:actor-portfolio:v1','{"corrupt":true}');
  expect(()=>readActorPortfolios(mem)).toThrow();
  expect(mem.getItem('lifeos:persona:actor-portfolio:v1')).toContain('corrupt');
 });
 it('rejects unsafe track URLs and unverified legal claims are visible as unverified',()=>{
  expect(validateMusicSyncTrack(track())).toEqual(track());
  for(const url of ['http://example.com/music','javascript:alert(1)','https://u:pw@example.com/a']){
   expect(()=>validateMusicSyncTrack({...track(),trackUrl:url})).toThrow();
  }
  expect(()=>validateMusicSyncTrack({...track(),durationSec:0})).toThrow();
  const packet=makeMusicSyncPack([track()]);
  expect(packet.tracks[0].stems).toBe(true);
  expect(packet.tracks[0].rightsStatus).toBe('unverified');
  expect(packet.rightsDisclaimer).toContain('не является лицензией');
  expect(()=>makeMusicSyncPack([track(),track()])).toThrow();
 });
 it('uses Arsenal face-object-face staging in newly generated edit intent, without footage',()=>{
  const brief=buildPersonaProductionBrief({
   idea:{id:'test-actor-brief',title:'Художественная зарисовка',angle:'Герой должен принять трудное решение',format:'reel'},
  });
  expect(brief.shots.map(x=>x.framing)).toEqual(['close-up','detail','close-up']);
  // The generic builder must not attach a new approval-sensitive pre-edit snapshot
  // to legacy briefs; the specific actor portfolio has its own intent-only EditPlan.
  expect(brief.preEditPlan).toBeUndefined();
  expect(brief.postProduction.transitions).toContain('лицо');
 });
 it('renders actor and music entry screens with real creation and PDF actions',()=>{
  const actor=renderToStaticMarkup(<PersonaActorPortfolio onBack={()=>{}}/>);
  const music=renderToStaticMarkup(<PersonaMusicSyncPortfolio onBack={()=>{}}/>);
  expect(actor).toContain('Художественная визитка');
  expect(actor).toContain('Собрать сценарий, раскадровку и свет');
  expect(music).toContain('Музыка для лицензирования');
  expect(music).toContain('PDF-пакет');
  expect(music).toContain('IndexedDB');
 });
});
