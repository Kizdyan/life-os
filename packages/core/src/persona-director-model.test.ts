import {describe,it,expect} from 'vitest';
import {
 personaDirectorToBrief,readPersonaDirectorProposal,type PersonaDirectorProposal,
} from './persona-director-model';

const created='2026-11-03T13:00:00.000Z';
const proposal:PersonaDirectorProposal={
 version:1,kind:'persona-director-proposal-v1',executionMode:'ai',provider:'ollama',
 model:'qwen3:4b-instruct',ideaId:'reel-001',createdAt:created,publicationApproved:false,
 title:'Режиссёр против композитора',hook:'Музыка меняет смысл сцены',
 setup:{
  location:'Тихая домашняя комната с клавишами на заднем плане',
  camera:'Смартфон на штативе вертикально, задняя камера 1x',
  lighting:'Мягкий боковой свет без смешанной температуры',
  sound:'Петличный микрофон и запись комнатного тона',
  wardrobe:'Однотонная футболка и пиджак для смены ролей',
  arrangement:'Две точки съёмки напротив друг друга',
 },
 editingIntent:'Резкие смысловые склейки на ответных репликах',
 colorIntent:'Натуральная кожа и единая нейтральная палитра',
 scenes:[
  {durationSec:4,line:'Мы же просто снимем спокойную сцену?',action:'Актёр смотрит на клавиши',
   framing:'close-up',camera:'Статичный крупный план на уровне глаз',lighting:'Мягкий боковой свет',
   performance:'Небольшое сомнение в голосе',edit:'Резать сразу на взгляд'},
  {durationSec:5,line:'А если музыка превратит её в триллер?',action:'Композитор пробует диссонанс',
   framing:'medium',camera:'Средний план с клавишами',lighting:'Оставить лицо читаемым',
   performance:'Сухая интонация',edit:'Оставить музыкальный акцент'},
  {durationSec:5,line:'Тогда у меня другая актёрская задача.',action:'Актёр меняет осанку',
   framing:'close-up',camera:'Крупный план без движения',lighting:'Сохранить рисунок первой роли',
   performance:'Медленно перейти от улыбки к тревоге',edit:'Склейка по изменению выражения'},
  {durationSec:4,line:'Вот теперь это настоящий поворот!',action:'Композитор убирает руки с клавиш',
   framing:'detail',camera:'Деталь рук и последняя реакция',lighting:'Подсветить клавиши без бликов',
   performance:'Пауза перед последним словом',edit:'Завершить на музыкальной паузе'},
 ],
};
const idea={id:'reel-001',title:'Первый ролик',angle:'Актёр и музыка',format:'reel' as const};

describe('Persona AI Director canonical handoff',()=>{
 it('accepts only a real model-labelled, bounded, unapproved storyboard and renders concrete production brief',()=>{
  expect(readPersonaDirectorProposal(proposal,idea.id)).toEqual(proposal);
  const brief=personaDirectorToBrief(idea,proposal);
  expect(brief.ideaId).toBe(idea.id);
  expect(brief.script).toHaveLength(4);
  expect(brief.script[0].line).toBe(proposal.scenes[0].line);
  expect(brief.shots[1].angle).toBe(proposal.scenes[1].camera);
  expect(brief.shots[0].lighting).toBe(proposal.scenes[0].lighting);
  expect(brief.capture.audio.recording).toBe(proposal.setup.sound);
  expect(brief.postProduction.color).toBe(proposal.colorIntent);
  expect(brief.preEditPlan?.origin).toBe('ai_director');
  expect(brief.preEditPlan?.researchEvidence.level).toBe('hypothesis_only');
  expect(brief.preEditPlan?.scenes.map(scene=>scene.editIntent)).toEqual(proposal.scenes.map(scene=>scene.edit));
  expect(brief.preEditPlan?.scenes.map(scene=>scene.visualIntent?.performance)).toEqual(proposal.scenes.map(scene=>scene.performance));
  expect(brief.preEditPlan?.colorIntent).toBe(proposal.colorIntent);
  expect(brief.preEditPlan?.publicationApproved).toBe(false);
  expect(brief.preEditPlan?.scenes.every(scene=>scene.mediaStatus==='awaiting_author_footage')).toBe(true);
  expect(brief.adaptations.reels.durationSec).toBe(18);
  expect(brief.factReferences).toEqual([]);
  expect('approval' in brief).toBe(false);
 });
 it('accepts an intentional three-genre refrain with different acting and musical intentions',()=>{
  const repeated={...proposal,title:'Один текст — три жанра',
   scenes:proposal.scenes.map(scene=>({...scene,line:'Ты всё-таки пришёл.'}))};
  const result=readPersonaDirectorProposal(repeated,idea.id);
  expect(result).not.toBeNull();
  const brief=personaDirectorToBrief(idea,repeated);
  expect(brief.script.map(beat=>beat.line)).toEqual(Array(4).fill('Ты всё-таки пришёл.'));
  expect(new Set(brief.preEditPlan?.scenes.map(beat=>beat.editIntent)).size).toBe(4);
  expect(brief.preEditPlan?.publicationApproved).toBe(false);
  const duplicateAction={...repeated,scenes:repeated.scenes.map((scene,index)=>
   index===1?{...scene,action:repeated.scenes[0].action}:scene)};
  expect(readPersonaDirectorProposal(duplicateAction,idea.id)).toBeNull();
  const duplicatePerformance={...repeated,scenes:repeated.scenes.map((scene,index)=>
   index===2?{...scene,performance:repeated.scenes[0].performance}:scene)};
  expect(readPersonaDirectorProposal(duplicatePerformance,idea.id)).toBeNull();
  const duplicateEdit={...repeated,scenes:repeated.scenes.map((scene,index)=>
   index===3?{...scene,edit:repeated.scenes[0].edit}:scene)};
  expect(readPersonaDirectorProposal(duplicateEdit,idea.id)).toBeNull();
 });
 it('refuses templates, fake publication approval, alien project, repeated lines and bogus timings',()=>{
  expect(readPersonaDirectorProposal({...proposal,executionMode:'template'},idea.id)).toBeNull();
  expect(readPersonaDirectorProposal({...proposal,publicationApproved:true},idea.id)).toBeNull();
  expect(readPersonaDirectorProposal({...proposal,ideaId:'other'},idea.id)).toBeNull();
  expect(readPersonaDirectorProposal({...proposal,scenes:[...proposal.scenes.slice(0,1),
   {...proposal.scenes[1],line:proposal.scenes[0].line},...proposal.scenes.slice(2)]},idea.id)).toBeNull();
  expect(readPersonaDirectorProposal({...proposal,scenes:proposal.scenes.map(s=>({...s,durationSec:1}))},idea.id)).toBeNull();
  expect(readPersonaDirectorProposal({...proposal,scenes:proposal.scenes.map(s=>({...s,durationSec:12}))},idea.id)).not.toBeNull();
  expect(readPersonaDirectorProposal({...proposal,scenes:proposal.scenes.map(s=>({...s,durationSec:20}))},idea.id)).toBeNull();
  expect(readPersonaDirectorProposal({...proposal,setup:{...proposal.setup,camera:''}},idea.id)).toBeNull();
  expect(()=>personaDirectorToBrief(idea,{...proposal,provider:'fake' as 'ollama'})).toThrow();
 });
});
