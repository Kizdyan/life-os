import React from 'react';
import {describe,it,expect} from 'vitest';
import {renderToString} from 'react-dom/server';
import {buildPersonaProductionBrief} from '../../../packages/core/src/persona-production-brief';
import {evaluatePersonaProductionBrief} from '../../../packages/core/src/persona-production-qa';
import {importPersonaProductionBrief} from '../../../packages/core/src/persona-production-pipeline';
import {createScenarioScript,reviseScenarioScript,type ScenarioIdea} from '../../../packages/core/src/persona-scenario-intelligence';
import {createPersonaProject,loadPersonaProjects,savePersonaProject} from './personaProjectStore';
import {PersonaProductionGuide} from './PersonaProductionGuide';
import {
 createPersonaProductionGuide,createActorComposerWorkingBrief,exampleActorComposerSourceFiles,actorComposerShotDirections,isActorComposerPilot,actorComposerPilot,exportPersonaShootingSheet,guideProgress,reviseGuideField,getPersonaGuideReadiness,
 productionGuideScenes,validatePersonaProductionGuide,guideShotNoteForScene,guideSceneFingerprint,updateGuideShotNote,migrateActorComposerShotNotes,
} from './personaProductionGuide';

const idea={id:'guide-1',title:'Актёр и композитор — колыбельная',angle:'Два срочных дела и комедийный музыкальный поворот',format:'reel' as const};
const now='2026-11-01T20:00:00.000Z';
const storage=()=>{
 const data=new Map<string,string>();
 return {getItem:(key:string)=>data.get(key)??null,setItem:(key:string,value:string)=>{data.set(key,value)},removeItem:(key:string)=>{data.delete(key)}};
};
describe('Persona full preproduction guide',()=>{
 it('renders a concrete, mobile-compatible shooting route, 7 exact lines, lighting and editing, with no false trends',()=>{
  const html=renderToString(<PersonaProductionGuide projectTitle={idea.title} projectAngle={idea.angle} allowExample={true}
   pipeline={null} onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('От идеи до первого монтажа');
  expect(html).toContain('Я актёр. И ещё пишу музыку.');
  expect(html).toContain('Это колыбельная? Это финал триллера.');
  expect(html).toContain('Локация, камера, свет, звук');
  expect(html).toContain('Предварительный монтаж');
  expect(html).toContain('Подтверждённых референсов пока нет');
  expect(html).toContain('НЕ ПУБЛИКАЦИЯ');
  expect(html).toContain('Создать редактируемый сценарий из этих 7 сцен');
 });
 it('persists per-scene directions and invalidates a changed script before reuse',()=>{
  const guide=createPersonaProductionGuide(now,'actor_composer');
  const scene=productionGuideScenes(null)[0];
  const note={camera:'Смартфон на уровне глаз, 1,2 м',lighting:'Мягкий свет из окна',
   performance:'Речь с паузой',edit:'Резкая склейка после слова'};
  const updated=updateGuideShotNote(guide,scene,note,now);
  expect(validatePersonaProductionGuide(updated)).toBe(true);
  expect(guideShotNoteForScene(updated,scene)).toEqual({
   note:{sceneFingerprint:guideSceneFingerprint(scene),...note},stale:false,
  });
  const revised={...scene,line:'Изменённый авторский хук'};
  expect(guideShotNoteForScene(updated,revised).stale).toBe(true);
  expect(guideShotNoteForScene(updated,{...scene,seconds:5}).stale).toBe(true);
  const oldFlags={...guide,checks:{set:true,lighting:true,takes:true,editReview:true,script:true}};
  const edited=updateGuideShotNote(oldFlags,scene,note,now);
  expect(edited.checks.set).toBeUndefined();
  expect(edited.checks.lighting).toBeUndefined();
  expect(edited.checks.takes).toBeUndefined();
  expect(edited.checks.editReview).toBeUndefined();
  expect(edited.checks.script).toBe(true);
  const storage=(()=>{const data=new Map<string,string>();return {
   getItem:(key:string)=>data.get(key)??null,
   setItem:(key:string,value:string)=>{data.set(key,value)},
   removeItem:(key:string)=>data.delete(key),
  }})();
  const project=createPersonaProject({id:'shot-note',title:'Мой Reels',contentType:'reel',sourceIdea:'Сцены',now});
  const nextProject={...project,scenarioWorkspace:{
   version:1 as const,research:[],analyses:[],ideas:[],preProductionGuide:updated,
  }};
  savePersonaProject(storage,nextProject,project.id);
  expect(loadPersonaProjects(storage,()=>project.id).projects[0].scenarioWorkspace?.preProductionGuide?.shotNotes?.[scene.id]?.camera).toBe(note.camera);
 });
 it('reconfirms edited scenes using the NEW fingerprint, even when the caller supplies the old record',()=>{
  const scene=productionGuideScenes(null)[0];
  const values={camera:'Ближе к лицу',lighting:'Боковой софтбокс',performance:'Пауза',
   edit:'Жёсткая склейка'};
  const original=updateGuideShotNote(createPersonaProductionGuide(now,'actor_composer'),scene,values,now);
  const rewritten={...scene,line:'Новая авторская реплика',seconds:4};
  expect(guideShotNoteForScene(original,rewritten).stale).toBe(true);
  const oldNote=original.shotNotes![scene.id];
  const confirmed=updateGuideShotNote(original,rewritten,oldNote,now);
  expect(confirmed.shotNotes![scene.id].sceneFingerprint).toBe(guideSceneFingerprint(rewritten));
  expect(guideShotNoteForScene(confirmed,rewritten).stale).toBe(false);
  expect(confirmed.shotNotes![scene.id].camera).toBe(values.camera);
  expect(confirmed.shotNotes![scene.id].edit).toBe(values.edit);
 });
 it('transfers every customized shot from A/B pilot IDs to canonical brief scenes without losing editorial detail',()=>{
  const first=productionGuideScenes(null)[0],second=productionGuideScenes(null)[1];
  const a={camera:'Крупно · смартфон 1 м',lighting:'Мягкий свет из окна',
   performance:'Взгляд в объектив',edit:'На последнем слоге склейка'};
  const b={camera:'Средний план у клавиш',lighting:'Один тёплый прибор',
   performance:'Сухая подача',edit:'Микропауза перед реакцией'};
  let guide=updateGuideShotNote(createPersonaProductionGuide(now,'actor_composer'),first,a,now);
  guide=updateGuideShotNote(guide,second,b,now);
  const brief=createActorComposerWorkingBrief(idea,guide);
  expect(brief.shots[0].angle).toBe(a.camera);
  expect(brief.shots[0].lighting).toBe(a.lighting);
  expect(brief.shots[0].action).toContain(a.performance);
  expect(brief.postProduction.transitions).toContain(a.edit);
  expect(brief.shots[1].angle).toBe(b.camera);
  const migrated=migrateActorComposerShotNotes(guide,brief,now);
  expect(validatePersonaProductionGuide(migrated)).toBe(true);
  expect(migrated.shotNotes?.A01).toBeUndefined();
  expect(migrated.shotNotes?.B01).toBeUndefined();
  const scenes=productionGuideScenes(brief);
  expect(guideShotNoteForScene(migrated,scenes[0]).stale).toBe(false);
  expect(guideShotNoteForScene(migrated,scenes[0]).note?.camera).toBe(a.camera);
  expect(guideShotNoteForScene(migrated,scenes[1]).note?.edit).toBe(b.edit);
  expect(guideShotNoteForScene(migrated,{...scenes[0],line:'Обновлённый хук'}).stale).toBe(true);
  const output=exportPersonaShootingSheet({
   title:actorComposerPilot.title,angle:actorComposerPilot.angle,
   guide:migrated,scenes:scenes.map(scene=>({
    ...scene,...(guideShotNoteForScene(migrated,scene).note??{}),
   })),sample:false,references:[],
  });
  expect(output).toContain(a.camera);
  expect(output).toContain(b.edit);
 });
 it('shows the current authored shot directions on the page instead of the conflicting default proposal',()=>{
  const scene=productionGuideScenes(null)[0];
  const guide=updateGuideShotNote(createPersonaProductionGuide(now,'actor_composer'),scene,{
   camera:'МОЯ КАМЕРА · 1,5 м',lighting:'МОЙ СВЕТ · мягкая лампа',
   performance:'МОЯ ИГРА · спокойная пауза',edit:'МОЯ СКЛЕЙКА · по вдоху',
  },now);
  const html=renderToString(<PersonaProductionGuide projectTitle={actorComposerPilot.title}
   projectAngle={actorComposerPilot.angle} allowExample={true}
   workspace={{version:1,research:[],analyses:[],ideas:[],preProductionGuide:guide}}
   pipeline={null} onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('Авторские режиссёрские указания');
  expect(html).toContain('МОЯ КАМЕРА · 1,5 м');
  expect(html).toContain('МОЙ СВЕТ · мягкая лампа');
  expect(html).toContain('МОЯ ИГРА · спокойная пауза');
  expect(html).not.toContain('Штатив на уровне глаз, ориентир 0,9–1,3 м');
  const brief=createActorComposerWorkingBrief(idea,guide);
  const migrated=migrateActorComposerShotNotes(guide,brief,now);
  const after=renderToString(<PersonaProductionGuide projectTitle={actorComposerPilot.title}
   projectAngle={actorComposerPilot.angle} allowExample={true}
   workspace={{version:1,research:[],analyses:[],ideas:[],preProductionGuide:migrated}}
   pipeline={importPersonaProductionBrief({brief,selectedIdea:idea})}
   onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(after).toContain('МОЯ КАМЕРА · 1,5 м');
  expect(after).toContain('МОЯ ИГРА · спокойная пауза');
  expect(after).not.toContain('требует повторной проверки');
 });
 it('does not auto-reconfirm notes that were already stale before applying a script template',()=>{
  const scene=productionGuideScenes(null)[0];
  const guide=updateGuideShotNote(createPersonaProductionGuide(now,'actor_composer'),scene,
   {camera:'Камера',lighting:'Свет',performance:'Игра',edit:'Склейка'},now);
  const stale={...guide,shotNotes:{...guide.shotNotes,
   [scene.id]:{...guide.shotNotes![scene.id],sceneFingerprint:'previous-unreviewed-revision'}}};
  const migrated=migrateActorComposerShotNotes(stale,createActorComposerWorkingBrief(idea,stale),now);
  expect(guideShotNoteForScene(migrated,productionGuideScenes(createActorComposerWorkingBrief(idea,stale))[0]).stale).toBe(true);
 });
 it('rejects hostile or malformed per-shot records and renders editors on non-pilot scripts',()=>{
  const guide=createPersonaProductionGuide(now);
  const scene=productionGuideScenes(null)[0];
  const note={camera:'План',lighting:'Свет',performance:'Игра',edit:'Склейка'};
  const updated=updateGuideShotNote(guide,scene,note,now);
  expect(validatePersonaProductionGuide({...updated,shotNotes:{'../escape':updated.shotNotes![scene.id]}})).toBe(false);
  expect(validatePersonaProductionGuide({...updated,shotNotes:{A01:{...updated.shotNotes![scene.id],camera:42}}})).toBe(false);
  const brief=buildPersonaProductionBrief({idea});
  const html=renderToString(<PersonaProductionGuide projectTitle="Другой Reels"
   projectAngle="Свой сценарий" allowExample={false}
   pipeline={importPersonaProductionBrief({brief,selectedIdea:idea})}
   onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('Режиссёрский план этого кадра');
  expect(html).toContain('Камера, крупность, расстояние и ракурс');
  expect(html).toContain('Актёрская задача, движения и интонация');
 });
 it('does not inject unrelated actor/composer scenes or sources into an unrelated Reel',()=>{
  const other={title:'Как устроен мой спектакль',angle:'Показать реквизит и работу над образом'};
  expect(isActorComposerPilot(other)).toBe(false);
  expect(isActorComposerPilot(actorComposerPilot)).toBe(true);
  const html=renderToString(<PersonaProductionGuide projectTitle={other.title}
   projectAngle={other.angle} allowExample={false}
   pipeline={null} onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('нет утверждённых реплик');
  expect(html).not.toContain('Это колыбельная? Это финал триллера.');
  expect(html).not.toContain('Почему стоит проверить формат');
  expect(html).not.toContain('Создать редактируемый сценарий из этих 7 сцен');
  expect(html).toContain('Определите конкретную аудиторию');
  expect(createPersonaProductionGuide(now).fields.sound).not.toContain('B03');
  expect(createPersonaProductionGuide(now,'actor_composer').fields.sound).toContain('B03');
 });
 it('gives the opt-in pilot 7 concrete camera and montage cues, without mixing them into other topics',()=>{
  const html=renderToString(<PersonaProductionGuide projectTitle={actorComposerPilot.title}
   projectAngle={actorComposerPilot.angle} allowExample={true} pipeline={null}
   onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('ориентир 0,9–1,3 м');
  expect(html).toContain('Монтаж:');
  expect(html).toContain('A01_actor_hook_take01.mp4');
  const sheet=exportPersonaShootingSheet({
   title:actorComposerPilot.title,angle:actorComposerPilot.angle,
   guide:createPersonaProductionGuide(now,'actor_composer'),sample:true,references:[],
   scenes:productionGuideScenes(null).map((scene,i)=>({...scene,...actorComposerShotDirections[scene.id]})),
  });
  expect(sheet).toContain('Камера:');
  expect(sheet).toContain('Актёрское действие:');
  expect(sheet).toContain('Музыка только ПОСЛЕ речи');
  expect(sheet).toContain('Монтаж:');
 });
 it('unchecks dependent stage confirmations when production details change',()=>{
  const guide={...createPersonaProductionGuide(now),checks:{
   research:true,script:true,set:true,lighting:true,sound:true,takes:true,editReview:true,
  }};
  const light=reviseGuideField(guide,'keyLight','Новый свет',now);
  expect(light.checks.lighting).toBeUndefined();
  expect(light.checks.takes).toBeUndefined();
  expect(light.checks.editReview).toBeUndefined();
  expect(light.checks.script).toBe(true);
  expect(light.checks.research).toBe(true);
  const word=reviseGuideField(light,'topicEvidence','Новый источник',now);
  expect(word.checks.research).toBeUndefined();
  expect(reviseGuideField(guide,'keyLight',guide.fields.keyLight,now)).toBe(guide);
 });
 it('guides each project to its next actual pending production decision, without claiming a real render',()=>{
  const guide=createPersonaProductionGuide(now);
  const noScript=getPersonaGuideReadiness({hasScript:false,scriptApproved:false,hasCurrentBrief:false,briefApproved:false,guide});
  expect(noScript.nextAction).toContain('Составьте хук');
  expect(noScript.items.find(x=>x.id==='takes')?.state).toBe('manual');
  expect(noScript.items.find(x=>x.id==='edit')?.state).toBe('manual');
  const approvedText=getPersonaGuideReadiness({hasScript:true,scriptApproved:true,hasCurrentBrief:false,briefApproved:false,guide});
  expect(approvedText.nextAction).toContain('Production Brief');
  expect(approvedText.items.find(x=>x.id==='script')?.state).toBe('done');
  const briefPending=getPersonaGuideReadiness({hasScript:true,scriptApproved:true,hasCurrentBrief:true,briefApproved:false,guide});
  expect(briefPending.nextAction).toContain('редакторское решение');
  const prep=getPersonaGuideReadiness({hasScript:true,scriptApproved:true,hasCurrentBrief:true,briefApproved:true,guide});
  expect(prep.nextAction).toContain('камеру, свет и звук');
  const checked={...guide,checks:{set:true,lighting:true,sound:true}};
  const ready=getPersonaGuideReadiness({hasScript:true,scriptApproved:true,hasCurrentBrief:true,briefApproved:true,guide:checked});
  expect(ready.nextAction).toContain('реальные дубли');
  expect(ready.items.find(x=>x.id==='takes')?.state).not.toBe('done');
 });
 it('creates an unapproved 31-second candidate inside canonical production model, not a published reel',()=>{
  const guide=createPersonaProductionGuide(now);
  const brief=createActorComposerWorkingBrief(idea,guide);
  expect(brief.script).toHaveLength(7);
  expect(brief.shots).toHaveLength(7);
  expect(brief.shots.reduce((n,s)=>n+s.durationSec,0)).toBe(31);
  expect(brief.shots[0].action).toContain(exampleActorComposerSourceFiles.A01);
  expect(brief.shots[5].action).toContain(exampleActorComposerSourceFiles.B03);
  expect(brief.script[0].line).toBe('Я актёр. И ещё пишу музыку.');
  expect(brief.script[6].line).toBe('Это колыбельная? Это финал триллера.');
  const qa=evaluatePersonaProductionBrief({brief,allowedFacts:[]});
  expect(qa.structuralChecks.every(x=>x.passed)).toBe(true);
  const pipeline=importPersonaProductionBrief({brief,selectedIdea:idea});
  expect(pipeline.materials.editorialDecision).toBeUndefined();
  expect(pipeline.stage).toBe('QA');
  expect(pipeline.materials.qa?.editorialReview.state).toBe('pending');
 });
 it('does not conceal a newer scenario revision behind a stale Production Brief',()=>{
  const brief=buildPersonaProductionBrief({idea});
  const scIdea:ScenarioIdea={
   id:'scenario-1',title:idea.title,referenceIds:[],originalConflict:idea.angle,
   actingTask:'Сыграть две роли',ending:'Панчлайн',productionComplexity:'medium',
   estimatedDurationSec:31,creativeProfileFit:'Для актёра и композитора',
   origin:'template_fallback',evidenceNote:'Демонстрационный сценарий',
  };
  const script=createScenarioScript(scIdea,{createdAt:now,beats:brief.script.map((beat,index)=>({
   purpose:index===0?'hook' as const:index===brief.script.length-1?'ending' as const:'development' as const,
   line:beat.line,action:beat.action,durationSec:beat.durationSec,
  }))});
  const revised=reviseScenarioScript(script,{createdAt:now,reason:'Изменили хук',beats:script.currentRevision.beats.map((beat,i)=>
   i===0?{...beat,line:'Новый сохранённый хук'}:beat)});
  const html=renderToString(<PersonaProductionGuide projectTitle={idea.title} projectAngle={idea.angle}
   allowExample={true} workspace={{version:1,research:[],analyses:[],ideas:[],script:revised}}
   pipeline={importPersonaProductionBrief({brief,selectedIdea:idea})}
   onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('Новый сохранённый хук');
  expect(html).toContain('устарели');
 });
 it('exports every spoken line and setup decision without pretending the example was approved',()=>{
  const guide=createPersonaProductionGuide(now);
  guide.fields.location='Моя реально выбранная комната';
  const scenes=productionGuideScenes(null);
  const sheet=exportPersonaShootingSheet({title:idea.title,angle:idea.angle,guide,scenes,sample:true,references:[]});
  expect(sheet).toContain('Моя реально выбранная комната');
  expect(sheet).toContain('Это колыбельная? Это финал триллера.');
  expect(sheet).toContain('демонстрационный пример');
  expect(sheet).toContain('НЕ УТВЕРЖДЕНИЕ');
  expect(sheet).toContain('- [ ]');
  expect(sheet).not.toContain('РАЗРЕШЕНО ПУБЛИКОВАТЬ');
 });
 it('rejects unchecked, malformed guide records and keeps old projects valid',()=>{
  const guide=createPersonaProductionGuide(now);
  expect(validatePersonaProductionGuide(guide)).toBe(true);
  expect(validatePersonaProductionGuide({...guide,fields:{...guide.fields,camera:'a'.repeat(6001)}})).toBe(false);
  expect(validatePersonaProductionGuide({...guide,checks:{publishApproved:true}})).toBe(false);
  const project=createPersonaProject({id:idea.id,title:idea.title,contentType:'reel',sourceIdea:idea.angle,now});
  const store=storage();
  savePersonaProject(store,project,project.id);
  expect(loadPersonaProjects(store,()=>idea.id).projects[0].scenarioWorkspace).toBeUndefined();
  const withGuide={...project,revision:2,scenarioWorkspace:{version:1 as const,research:[],analyses:[],ideas:[],
   preProductionGuide:{...guide,checks:{set:true,lighting:true}}}};
  savePersonaProject(store,withGuide,withGuide.id);
  const loaded=loadPersonaProjects(store,()=>idea.id).projects[0];
  expect(guideProgress(loaded.scenarioWorkspace!.preProductionGuide!)).toBe(2);
  expect(loaded.scenarioWorkspace?.preProductionGuide?.fields.location).toBe(guide.fields.location);
 });
 it('recognizes an existing brief-only script and requests editorial approval, not rewriting the hook',()=>{
  const brief=buildPersonaProductionBrief({idea});
  const html=renderToString(<PersonaProductionGuide projectTitle={idea.title} projectAngle={idea.angle}
   allowExample={false} pipeline={importPersonaProductionBrief({brief,selectedIdea:idea})}
   onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).not.toContain('Составьте хук, развитие и финальную реплику');
  expect(html).toContain('Проверьте и утвердите текущую редакцию реплик');
  expect(html).toContain(brief.script[0].line);
 });
 it('does not imply saved scenes in a generic empty shooting-sheet export',()=>{
  const sheet=exportPersonaShootingSheet({
   title:'Новая идея',angle:'Ищем конфликт',guide:createPersonaProductionGuide(now),
   sample:false,scenes:[],references:[],
  });
  expect(sheet).toContain('пока нет сценария');
  expect(sheet).not.toContain('из сохранённого сценария/Production Brief');
 });
 it('warns when camera-ready notes disagree with the canonical existing brief',()=>{
  const guide=createPersonaProductionGuide(now);
  const brief=buildPersonaProductionBrief({idea});
  const html=renderToString(<PersonaProductionGuide
   projectTitle={idea.title} projectAngle={idea.angle} allowExample={false}
   workspace={{version:1,research:[],analyses:[],ideas:[],preProductionGuide:guide}}
   pipeline={importPersonaProductionBrief({brief,selectedIdea:idea})}
   onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).toContain('отличаются от Production Brief');
  expect(html).toContain('НЕ обновляют съёмочный бриф автоматически');
 });
 it('shows current approved brief instead of substituting the seven-shot sample',()=>{
  const guide=createPersonaProductionGuide(now);
  const generic=buildPersonaProductionBrief({idea});
  const pipeline=importPersonaProductionBrief({brief:generic,selectedIdea:idea});
  const html=renderToString(<PersonaProductionGuide projectTitle={idea.title} projectAngle={idea.angle} allowExample={true}
   workspace={{version:1,research:[],analyses:[],ideas:[],preProductionGuide:guide}}
   pipeline={pipeline} onSave={()=>{}} onUseExample={()=>{}} onNavigate={()=>{}}/>);
  expect(html).not.toContain('Создать редактируемый сценарий из этих 7 сцен');
  expect(html).toContain(generic.script[0].line);
  expect(productionGuideScenes(generic)).toHaveLength(generic.script.length);
  expect(productionGuideScenes(generic)[0].angle).toBe(generic.shots[0].angle);
  expect(html).toContain(generic.shots[0].angle);
  expect(html).toContain(generic.shots[0].cameraMovement);
 });
});
