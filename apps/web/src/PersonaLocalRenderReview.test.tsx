import React from 'react';
import {renderToString} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {PersonaLocalRenderReview} from './PersonaLocalRenderReview';
import {actorComposerPilot,createActorComposerWorkingBrief,createPersonaProductionGuide} from './personaProductionGuide';
import {importPersonaProductionBrief,recordPersonaEditorialDecision} from '../../../packages/core/src/persona-production-pipeline';
import type {PersonaLocalRenderRecord} from './personaLocalRenderImport';

const now='2026-11-02T12:00:00.000Z';
const idea={id:'pilot-1',title:actorComposerPilot.title,angle:actorComposerPilot.angle,format:'reel' as const};

function fixture(){
 const brief=createActorComposerWorkingBrief(idea,createPersonaProductionGuide(now,'actor_composer'));
 const imported=importPersonaProductionBrief({brief,selectedIdea:idea});
 const approved=recordPersonaEditorialDecision(imported,{
  decision:'approved',editor:'Автор',comment:'Все семь сцен проверены',factReviewCompleted:true,decidedAt:now,
 });
 const record:PersonaLocalRenderRecord={
  version:1,kind:'persona-local-render-review-v1',projectId:'p1',briefIdeaId:brief.ideaId,
  briefSnapshot:JSON.stringify(brief),briefFingerprintSha256:'a'.repeat(64),
  mp4Sha256:'b'.repeat(64),mp4Bytes:600000,mp4Name:'draft-reel.mp4',
  durationSec:31,width:1080,height:1920,fps:30,timingStatus:'within-brief-tolerance',
  status:'awaiting-author-review',importedAt:now,
  qaProvenance:'locally-imported-report-not-independently-attested',publicationApproved:false,
 };
 const render=(pipeline:typeof approved,renderRecord=record)=>renderToString(
  <PersonaLocalRenderReview projectId="p1" pipeline={pipeline}
   record={renderRecord} onSave={()=>true}/>
 );
 return {brief,approved,record,render};
}
describe('Persona local render review protects revoked shoot approvals',()=>{
 it('shows a matching saved draft only while the brief has current author authorization',()=>{
  const {approved,render}=fixture();
  const html=render(approved);
  expect(html).toContain('Файл принят для авторского просмотра');
  expect(html).not.toContain('Утверждение Production Brief больше не действует');
 });
 it('hides historical render and finished controls when approval has been revoked',()=>{
  const {approved,render}=fixture();
  const {editorialDecision:_unused,...materials}=approved.materials;
  const revoked={...approved,stage:'QA' as const,
   statuses:{...approved.statuses,QA:'needs_revision' as const,READY_FOR_SHOOT:'pending' as const},
   materials};
  const html=render(revoked);
  expect(html).toContain('Утверждение Production Brief больше не действует');
  expect(html).not.toContain('Файл принят для авторского просмотра');
  expect(html).not.toContain('Скачать настройки финализации');
  expect(html).not.toContain('Финишный Reels · художественная приёмка');
 });
 it('treats results from changed brief as obsolete even if the pipeline has a valid approval',()=>{
  const {approved,render,record}=fixture();
  const html=render(approved,{...record,briefSnapshot:record.briefSnapshot+' '});
  expect(html).toContain('другой версии сценария или брифа');
  expect(html).not.toContain('Файл принят для авторского просмотра');
 });
});
