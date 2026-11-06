import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import PersonaFactory, { personaAutosaveApprovalSnapshotMatches, PersonaProductionBriefPanel, buildPersonaProductionWorkflow, ideaForImportedBrief, selectedPersonaProjectSnapshot, personaScenarioWorkspaceMountKey, productionBriefMatchesBeats, reconcilePersonaProductionWithScenario, assertPersonaProductionCanBeApproved, buildApprovedPersonaVideoBrief, canNavigateFromPersonaGuide, registerPersonaExitFlush, workspaceStepsFor } from './PersonaFactory';
import {productionBriefSnapshot,saveProductionInputDraft} from './personaProductionInputJournal';
import { createPersonaProject,applyPersonaProductionMilestone,savePersonaProject,loadPersonaProjects,type PersonaProjectCollection } from './personaProjectStore';
import {importPersonaProductionBrief,recordPersonaEditorialDecision} from '../../../packages/core/src/persona-production-pipeline';
import {createActorComposerWorkingBrief,createPersonaProductionGuide} from './personaProductionGuide';
import {addImportedBriefScenario} from './personaBriefScenarioBridge';
import {approveScenarioScript} from '../../../packages/core/src/persona-scenario-intelligence';

const quick={id:'local-project',title:'Новый Reels',angle:'Создать материал из собственных исходников',format:'reel' as const,score:0,source:'quick-start'};
const candidate={sourceTitle:'Один день между театром и музыкой',sourceAngle:'Две профессии одной историей',sourceFormat:'reel'};

describe('guide failed-save navigation safety',()=>{
 it('blocks navigation while an unsaved plan exists and permits it only after save or explicit discard',()=>{
  expect(canNavigateFromPersonaGuide(true)).toBe(false);
  expect(canNavigateFromPersonaGuide(false)).toBe(true);
 });
});
describe('production approval must follow latest current dialogue',()=>{
 it('refuses a changed line or timing while keeping legacy brief-only projects compatible',()=>{
  const prod=buildPersonaProductionWorkflow({id:'script-sync',title:'Сценка',angle:'Две роли',format:'reel',score:0});
  const brief=prod.materials.productionBrief!;
  expect(productionBriefMatchesBeats(brief,undefined)).toBe(true);
  const current=brief.script.map(beat=>({line:beat.line,action:beat.action,durationSec:beat.durationSec}));
  expect(productionBriefMatchesBeats(brief,current)).toBe(true);
  expect(productionBriefMatchesBeats(brief,current.map((beat,i)=>i===0?{...beat,line:'Новая реплика'}:beat))).toBe(false);
  expect(productionBriefMatchesBeats(brief,current.map((beat,i)=>i===0?{...beat,durationSec:beat.durationSec+1}:beat))).toBe(false);
  expect(productionBriefMatchesBeats(brief,[...current,{...current[0]}])).toBe(false);
 });
});
describe('script revision revokes production authorization',()=>{
 const idea={id:'revision-guard',title:'Актёр и композитор',angle:'Два дедлайна',format:'reel' as const};
 const now='2026-11-02T12:00:00.000Z';
 const production=()=>{
  const brief=createActorComposerWorkingBrief(idea,createPersonaProductionGuide(now,'actor_composer'));
  const qa=importPersonaProductionBrief({brief,selectedIdea:idea});
  const approved=recordPersonaEditorialDecision(qa,{
   decision:'approved',editor:'Автор',comment:'Проверено лично',factReviewCompleted:true,decidedAt:now,
  });
  const workspace=addImportedBriefScenario(undefined,brief,now);
  return {brief,approved,workspace};
 };
 it('blocks final shooting approval if the author creative decision is missing, withdrawn or stale',()=>{
  const {approved,brief,workspace}=production();
  const script=approveScenarioScript(workspace.script!,{
   author:'Автор',comment:'Проверена структура и формальная версия.',
   approvedAt:'2026-11-05T17:05:00.000Z',
  });
  const baseline={...workspace,script};
  expect(()=>assertPersonaProductionCanBeApproved(approved,workspace))
   .toThrow(/художественная оценка/);
  expect(()=>assertPersonaProductionCanBeApproved(approved,baseline))
   .toThrow(/художественная оценка/);
  const signed={...baseline,creativeReviews:[{
   revisionId:script.currentRevisionId,reviewer:'author' as const,
   decision:'ready_for_author' as const,
   comment:'Художественно проверил конфликт, реплики, музыку и финал.',
   createdAt:'2026-11-05T17:06:00.000Z',
  }]};
  expect(()=>assertPersonaProductionCanBeApproved(approved,signed)).not.toThrow();
  const withdrawn={...signed,creativeReviews:[...signed.creativeReviews,{
   ...signed.creativeReviews[0],decision:'needs_revision' as const,
   comment:'После повторной проверки драматургический конфликт слабый.',
   createdAt:'2026-11-05T17:07:00.000Z',
  }]};
  expect(()=>assertPersonaProductionCanBeApproved(approved,withdrawn))
   .toThrow(/художественная оценка/);
  const outdated={...approved,materials:{...approved.materials,productionBrief:{
   ...brief,preEditPlan:{...brief.preEditPlan!,origin:'scenario_revision' as const,
    sourceRevisionId:'old-r1'},
  }}};
  expect(()=>assertPersonaProductionCanBeApproved(outdated,signed))
   .toThrow(/прежней редакции/);
  const changed={...approved,materials:{...approved.materials,productionBrief:{
   ...brief,script:brief.script.map((item,i)=>i===0?{...item,line:'Изменённая реплика'}:item),
  }}};
  expect(()=>assertPersonaProductionCanBeApproved(changed,signed))
   .toThrow(/не соответствует/);
 });
 it('revokes a previously approved shoot when the SAME creative revision is explicitly rejected',()=>{
  const {brief,approved,workspace}=production();
  const rejectedReview={revisionId:workspace.script!.currentRevisionId,
   reviewer:'author' as const,decision:'needs_revision' as const,
   comment:'После внимательной проверки комедийный поворот и музыка не работают, нужно исправить.',
   createdAt:'2026-11-05T16:20:00.000Z'};
  expect(reconcilePersonaProductionWithScenario(approved,{...workspace,
   creativeReviews:[{...rejectedReview,revisionId:'unrelated-revision'}]}))
   .toBe(approved);
  const rejected={...workspace,creativeReviews:[rejectedReview]};
  const invalidated=reconcilePersonaProductionWithScenario(approved,rejected);
  expect(invalidated).not.toBe(approved);
  expect(invalidated?.stage).toBe('QA');
  expect(invalidated?.statuses.READY_FOR_SHOOT).toBe('pending');
  expect(invalidated?.materials.editorialDecision).toBeUndefined();
  expect(invalidated?.materials.productionBrief?.script).toEqual(brief.script);
  expect(invalidated?.materials.qa).toEqual(approved.materials.qa);
  expect(reconcilePersonaProductionWithScenario(invalidated,rejected)).toBe(invalidated);
 });
 it('reopens QA and removes an older human approval after a spoken line changes',()=>{
  const {brief,approved,workspace}=production();
  expect(approved.stage).toBe('READY_FOR_SHOOT');
  expect(approved.materials.editorialDecision?.decision).toBe('approved');
  const changed={...workspace,script:{...workspace.script!,
   currentRevision:{...workspace.script!.currentRevision,
    beats:workspace.script!.currentRevision.beats.map((beat,i)=>
     i===0?{...beat,line:'Совершенно новая первая реплика'}:beat)},
  }};
  const reconciled=reconcilePersonaProductionWithScenario(approved,changed);
  expect(reconciled).not.toBe(approved);
  expect(reconciled?.stage).toBe('QA');
  expect(reconciled?.statuses.READY_FOR_SHOOT).toBe('pending');
  expect(reconciled?.statuses.QA).toBe('needs_revision');
  expect(reconciled?.materials.editorialDecision).toBeUndefined();
  expect(reconciled?.materials.productionBrief?.script).toEqual(brief.script);
  expect(reconciled?.materials.qa).toEqual(approved.materials.qa);
  expect(reconcilePersonaProductionWithScenario(reconciled,changed)).toBe(reconciled);
 });
 it('revokes shoot permission if ONLY the approved pre-edit montage revision changes',()=>{
  const {brief,approved,workspace}=production();
  const rev=workspace.script!.currentRevisionId;
  const preEditPlan={
   version:1 as const,kind:'persona-pre-edit-plan-v1' as const,status:'intent_only' as const,
   origin:'scenario_revision' as const,sourceRevisionId:rev,
   researchEvidence:{level:'hypothesis_only' as const,sourceUrls:[],note:'Нет измеренных доказательств'},
   scenes:brief.script.map(beat=>({
    order:beat.order,line:beat.line,durationSec:beat.durationSec,
    editIntent:'Склейка на действие',audioIntent:'Реальный звук',subtitleIntent:'Только проверенная речь',
    mediaStatus:'awaiting_author_footage' as const,
   })),
   publicationApproved:false as const,
  };
  const planned={...approved,materials:{...approved.materials,
   productionBrief:{...brief,preEditPlan}}};
  expect(reconcilePersonaProductionWithScenario(planned,workspace)).toBe(planned);
  const changed={...workspace,script:{...workspace.script!,
   currentRevisionId:'new-edit-revision',
   currentRevision:{...workspace.script!.currentRevision,id:'new-edit-revision'},
  }};
  const revoked=reconcilePersonaProductionWithScenario(planned,changed);
  expect(revoked?.stage).toBe('QA');
  expect(revoked?.materials.editorialDecision).toBeUndefined();
  const altered=workspace.script!.currentRevision.beats.map((b,i)=>
   i===0?{...b,editIntent:'Склейка на другую реакцию'}:b);
  expect(productionBriefMatchesBeats({...brief,preEditPlan},altered)).toBe(false);
 });
 it('does not revoke a pipeline that has not created any Production Brief',()=>{
  const {workspace}=production();
  const draft={stage:'SCRIPT' as const,statuses:{
   IDEA:'completed' as const,SCRIPT:'pending' as const,SHOT_LIST:'pending' as const,
   PRODUCTION_BRIEF:'pending' as const,QA:'pending' as const,
   READY_FOR_SHOOT:'pending' as const,
  },input:{idea,sourceFacts:[]},qaAllowedFacts:[],materials:{}};
  expect(reconcilePersonaProductionWithScenario(draft,workspace)).toBe(draft);
 });
 it('does not touch signoff on research-only or unrelated workspace changes',()=>{
  const {approved,workspace}=production();
  expect(reconcilePersonaProductionWithScenario(approved,workspace)).toBe(approved);
  expect(reconcilePersonaProductionWithScenario(approved,{...workspace,research:[]})).toBe(approved);
  expect(reconcilePersonaProductionWithScenario(approved,undefined)).toBe(approved);
 });
 it('persists revised scenario and revoked shoot approval in the same project snapshot',()=>{
  const {approved,workspace}=production();
  const changed={...workspace,script:{...workspace.script!,
   currentRevision:{...workspace.script!.currentRevision,
    beats:workspace.script!.currentRevision.beats.map((beat,i)=>
     i===0?{...beat,durationSec:beat.durationSec+1}:beat)},
  }};
  const reset=reconcilePersonaProductionWithScenario(approved,changed)!;
  const storage=(()=>{const data=new Map<string,string>();return {
   getItem:(key:string)=>data.get(key)??null,
   setItem:(key:string,value:string)=>{data.set(key,value)},
   removeItem:(key:string)=>data.delete(key),
  }})();
  const start=createPersonaProject({id:'revision-guard',title:idea.title,contentType:'reel',sourceIdea:idea.angle,now});
  const project=applyPersonaProductionMilestone({...start,scenarioWorkspace:changed},reset,
   {stage:'final_qa',resetQa:true});
  savePersonaProject(storage,project,project.id);
  const saved=loadPersonaProjects(storage,()=>project.id).projects[0];
  expect(saved.scenarioWorkspace?.script?.currentRevision.beats[0].durationSec).toBe(changed.script.currentRevision.beats[0].durationSec);
  expect((saved.shootingPlan as typeof approved).materials.editorialDecision).toBeUndefined();
  expect((saved.shootingPlan as typeof approved).stage).toBe('QA');
 });
});

describe('legacy brief shortcuts preserve the approved authored script',()=>{
 const id={id:'real-story',title:'Актёр и композитор',angle:'Конфликт актёра с собственной музыкой',
  format:'reel' as const};
 const now='2026-11-05T17:25:00.000Z';
 const make=()=>{
  const initial=createActorComposerWorkingBrief(id,createPersonaProductionGuide(now,'actor_composer'));
  const old={...initial,preEditPlan:{
   version:1 as const,kind:'persona-pre-edit-plan-v1' as const,status:'intent_only' as const,
   origin:'scenario_revision' as const,sourceRevisionId:'source-before-import',
   researchEvidence:{level:'hypothesis_only' as const,sourceUrls:[],note:'Unverified planning notes'},
   scenes:initial.script.map((beat,i)=>({
    order:beat.order,line:beat.line,durationSec:beat.durationSec,
    editIntent:'Специальная склейка кадра '+(i+1)+' после реплики.',
    audioIntent:'Оригинальная музыка только по подтверждённому сценарию.',
    subtitleIntent:'Текст только на произнесённые слова.',
    mediaStatus:'awaiting_author_footage' as const,
   })),
   publicationApproved:false as const,
  }};
  const candidate=addImportedBriefScenario(undefined,old,now);
  const script=approveScenarioScript(candidate.script!,{
   author:'Автор',comment:'Прочитал и согласовал сценарий перед съёмкой.',
   approvedAt:'2026-11-05T17:26:00.000Z',
  });
  return {workspace:{...candidate,script}};
 };
 it('rejects unreviewed or rescinded versions and never replaces the full script with a template',()=>{
  const {workspace}=make();
  expect(()=>buildApprovedPersonaVideoBrief(id,workspace)).toThrow(/утвердите текущий сценарий/);
  const decision={revisionId:workspace.script.currentRevisionId,reviewer:'author' as const,
   decision:'ready_for_author' as const,
   comment:'Проверил конфликт, хук, актёрские действия, музыку и финал.',
   createdAt:'2026-11-05T17:27:00.000Z'};
  const signed={...workspace,creativeReviews:[decision]};
  const brief=buildApprovedPersonaVideoBrief(id,signed);
  expect(brief.script).toEqual(signed.script.currentRevision.beats.map((beat,i)=>({
   order:i+1,line:beat.line,action:beat.action,durationSec:beat.durationSec,
  })));
  expect(brief.preEditPlan?.origin).toBe('scenario_revision');
  expect(brief.preEditPlan?.sourceRevisionId).toBe(signed.script.currentRevisionId);
  expect(brief.preEditPlan?.scenes.map(item=>item.editIntent)).toEqual(
   signed.script.currentRevision.beats.map(item=>item.editIntent));
  expect(brief.hook.firstSeconds).toBe(signed.script.currentRevision.beats[0].line);
  const generic=buildPersonaProductionWorkflow({...id,score:0}).materials.productionBrief!;
  expect(brief.script).not.toEqual(generic.script);
  expect(brief.preEditPlan?.publicationApproved).toBe(false);
  expect(()=>buildApprovedPersonaVideoBrief({...id,format:'photo'},signed))
   .toThrow(/видеоформатов/);
  const withdrawn={...signed,creativeReviews:[...signed.creativeReviews,{
   ...decision,decision:'needs_revision' as const,
   comment:'Отзываю решение: финальный поворот слабый, актёрская задача требует доработки.',
   createdAt:'2026-11-05T17:28:00.000Z',
  }]};
  expect(()=>buildApprovedPersonaVideoBrief(id,withdrawn))
   .toThrow(/утвердите текущий сценарий/);
 });
});

describe('brief import identity',()=>{
 it('lets an empty quick-start project adopt a validated candidate identity without changing its project ID',()=>{
  expect(ideaForImportedBrief(quick,candidate,true)).toMatchObject({id:'local-project',title:candidate.sourceTitle,angle:candidate.sourceAngle,format:'reel',source:'imported-brief'});
 });
 it('does not relabel a project that already contains work or malformed imported data',()=>{
  expect(ideaForImportedBrief(quick,candidate,false)).toBe(quick);
  expect(ideaForImportedBrief(quick,{sourceTitle:'Другой'},true)).toBe(quick);
 });
});

describe('scenario editor instance identity',()=>{
 it('resets editor-local state across project, idea and source-revision changes',()=>{
  const base={script:{idea:{id:'idea-a'},currentRevisionId:'revision-1'}} as any;
  const key=personaScenarioWorkspaceMountKey('project-a',base);
  expect(personaScenarioWorkspaceMountKey('project-b',base)).not.toBe(key);
  expect(personaScenarioWorkspaceMountKey('project-a',{script:{idea:{id:'idea-b'},currentRevisionId:'revision-1'}} as any)).not.toBe(key);
  expect(personaScenarioWorkspaceMountKey('project-a',{script:{idea:{id:'idea-a'},currentRevisionId:'revision-2'}} as any)).not.toBe(key);
  expect(personaScenarioWorkspaceMountKey('project-a',base)).toBe(key);
 });
});

describe('persisted Persona project selection',()=>{
 it('uses the current stored revision even when a project card holds an older object',()=>{
  const stale=createPersonaProject({id:'p1',title:'Актёр и композитор',contentType:'reel',sourceIdea:'Музыка и театр',now:'2026-10-31T10:00:00.000Z'});
  const current={...stale,revision:stale.revision+2,title:'Новая версия',
   scenarioWorkspace:{version:1 as const,research:[],analyses:[],ideas:[],selectedIdeaId:'latest'}};
  const persisted:PersonaProjectCollection={schemaVersion:1,activeProjectId:'p1',projects:[current]};
  expect(stale.revision).toBeLessThan(current.revision);
  expect(selectedPersonaProjectSnapshot(persisted,stale.id)).toBe(current);
  expect(selectedPersonaProjectSnapshot(persisted,stale.id).scenarioWorkspace?.selectedIdeaId).toBe('latest');
 });
 it('rejects an id missing from the actual store instead of opening a stale card',()=>{
  const collection:PersonaProjectCollection={schemaVersion:1,activeProjectId:null,projects:[]};
  expect(()=>selectedPersonaProjectSnapshot(collection,'deleted-project')).toThrow('unknown_persona_project');
 });
});

describe('Production Brief recovery UI',()=>{
 const pipeline=buildPersonaProductionWorkflow({id:'idea-1',title:'Первый Reel',angle:'Сценка актёра',format:'reel',score:0});
 const brief=pipeline.materials.productionBrief!;
 const storage=()=>{
  const entries=new Map<string,string>();
  return {getItem:(key:string)=>entries.get(key)??null,
   setItem:(key:string,value:string)=>{entries.set(key,value)},
   removeItem:(key:string)=>{entries.delete(key)}};
 };
 const renderPanel=(store:ReturnType<typeof storage>,currentPipeline= pipeline)=>{
  vi.stubGlobal('window',{localStorage:store});
  try{
   return renderToString(React.createElement(PersonaProductionBriefPanel,{
    projectId:'project-1',pipeline:currentPipeline,editor:'Автор',comment:'Можно снимать',factsChecked:true,
    onEditorChange:()=>undefined,onCommentChange:()=>undefined,onFactsCheckedChange:()=>undefined,
    onDecision:()=>undefined,onRebuild:()=>undefined,onAngleChange:()=>undefined,onBriefChange:()=>true,
   }));
  }finally{vi.unstubAllGlobals()}
 };
 it('does not show recovery controls on an untouched production brief',()=>{
  const markup=renderPanel(storage());
  expect(markup).not.toContain('Проверить и сохранить восстановленную правку');
  expect(markup).toContain('Редактировать реплику 1');
 });
 it('keeps the pre-shoot camera, light, performance, edit, sound and colour directions visible in the canonical brief',()=>{
  const preEditPlan={version:1 as const,kind:'persona-pre-edit-plan-v1' as const,status:'intent_only' as const,
   origin:'scenario_revision' as const,sourceRevisionId:null,
   researchEvidence:{level:'hypothesis_only' as const,sourceUrls:[],note:'Творческая гипотеза, а не прогноз охватов.'},
   colorIntent:'Natural Clean: нейтральный белый и естественный тон кожи.',publicationApproved:false as const,
   scenes:brief.script.map((beat,index)=>({order:beat.order,line:beat.line,durationSec:beat.durationSec,
    editIntent:'Склейка по действию.',audioIntent:'Сохранить чистую речь.',subtitleIntent:'Титры в безопасной зоне.',
    visualIntent:{framing:index===0?'close-up' as const:'medium' as const,angle:'На уровне глаз.',cameraMovement:'Штатив.',lighting:'Мягкий источник.',performance:'Сыграть реакцию, а не объяснять её.'},
    mediaStatus:'awaiting_author_footage' as const,
   }))};
  const planned={...pipeline,materials:{...pipeline.materials,productionBrief:{...brief,preEditPlan}}} as typeof pipeline;
  const markup=renderPanel(storage(),planned);
  expect(markup).toContain('Цветовой замысел:');
  expect(markup).toContain('Камера:');
  expect(markup).toContain('Свет:');
  expect(markup).toContain('Актёрская задача:');
  expect(markup).toContain('Монтаж:');
  expect(markup).toContain('Субтитры:');
  expect(markup).toContain('публикация запрещена');
 });
 it('renders the exact unblurred text after reload without applying it automatically',()=>{
  const s=storage(),value='Автор ещё набирает новую реплику';
  saveProductionInputDraft(s,{version:1,projectId:'project-1',ideaId:brief.ideaId,base:productionBriefSnapshot(brief),field:'script:0:line',value},null);
  const markup=renderPanel(s);
  expect(markup).toContain(value);
  expect(markup).toContain('Проверить и сохранить восстановленную правку');
  expect(markup).toContain('Страховочная копия незавершённой правки');
 });
 it('keeps an earlier-revision draft visible, but not automatically recoverable',()=>{
  const s=storage();
  saveProductionInputDraft(s,{version:1,projectId:'project-1',ideaId:brief.ideaId,base:'previous-version',field:'script:0:line',value:'Старая реплика'},null);
  const markup=renderPanel(s);
  expect(markup).toContain('Старая реплика');
  expect(markup).toContain('Несохранённый текст из другой версии');
  expect(markup).not.toContain('Проверить и сохранить восстановленную правку');
 });
});

describe('Persona save-on-exit wiring',()=>{
 it('flushes on pagehide and hidden-tab transitions but not while visible',()=>{
  const targetWindow=new EventTarget();
  const targetDocument=new EventTarget() as EventTarget & {visibilityState:DocumentVisibilityState};
  targetDocument.visibilityState='visible';
  const flush=vi.fn();
  const unregister=registerPersonaExitFlush(targetWindow as unknown as Window,targetDocument as unknown as Document,flush);
  targetDocument.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(0);
  targetDocument.visibilityState='hidden';
  targetDocument.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(1);
  targetWindow.dispatchEvent(new Event('pagehide'));
  expect(flush).toHaveBeenCalledTimes(2);
  unregister();
  targetWindow.dispatchEvent(new Event('pagehide'));
  targetDocument.dispatchEvent(new Event('visibilitychange'));
  expect(flush).toHaveBeenCalledTimes(2);
 });
});

describe('Persona empty workspace server rendering',()=>{
 it('renders without window, location or localStorage (no browser globals)',()=>{
  const oldWindow=globalThis.window;
  const oldLocation=globalThis.location;
  const oldLocalStorage=globalThis.localStorage;
  try{
   vi.stubGlobal('window',undefined);
   vi.stubGlobal('location',undefined);
   vi.stubGlobal('localStorage',undefined);
   expect(()=>renderToString(React.createElement(PersonaFactory))).not.toThrow();
  }finally{
   vi.stubGlobal('window',oldWindow);
   vi.stubGlobal('location',oldLocation);
   vi.stubGlobal('localStorage',oldLocalStorage);
   vi.unstubAllGlobals();
  }
 });
});


describe('Persona preproduction stage order',()=>{
 it('places idea and script before shoot guide, assets, editing and output for every video format',()=>{
  for(const format of ['reel','short','story'] as const){
   const steps=workspaceStepsFor(format).map(([id])=>id);
   expect(steps).toEqual(['idea','script','guide','assets','edit','review','export']);
  }
 });
 it('keeps asset-first workflow for still photographs and carousel posts',()=>{
  expect(workspaceStepsFor('photo').map(([id])=>id)).toEqual(['assets','edit','review','export']);
  expect(workspaceStepsFor('carousel').map(([id])=>id)).toEqual(['assets','edit','review','export']);
 });
});

describe('Persona autosave approval isolation',()=>{
 it('rejects stale scenario and production snapshots but permits matching values',()=>{
  const savedScenario={version:1,script:{revision:'current'}};
  const savedPlan={materials:{editorialDecision:{decision:'approved'}}};
  expect(personaAutosaveApprovalSnapshotMatches(savedScenario,savedPlan,{...savedScenario},{...savedPlan})).toBe(true);
  expect(personaAutosaveApprovalSnapshotMatches(savedScenario,savedPlan,{version:1,script:{revision:'old'}},savedPlan)).toBe(false);
  expect(personaAutosaveApprovalSnapshotMatches(savedScenario,savedPlan,savedScenario,{materials:{editorialDecision:{decision:'pending'}}})).toBe(false);
 });
});
