import {describe,it,expect} from 'vitest';
import {
 EMPTY_PERSONA_STORY,assessPersonaStory,formatPersonaStoryAngle,
 type PersonaStoryOutline
} from './personaStoryMechanics';

const complete:PersonaStoryOutline={
 premise:'Актёр приехал на кастинг в неподходящих ботинках',
 hook:'Кастинг-директор требует от кандидата пробежать сцену',
 protagonistGoal:'Получить роль и не испортить впечатление',
 obstacle:'Новая обувь сковывает движения, а времени переобуться нет',
 escalation:'Попытка скрыть неудобство приводит к странным движениям',
 turn:'Режиссёр неожиданно просит повторить странную походку',
 payoff:'Герой получает не главную роль, а роль человека с нелепой походкой',
 actingAction:'Отстоять право на роль, скрывая реальную проблему',
 visualMoment:'Неуместная обувь крупным планом — на фоне серьёзной сцены'
};
describe('Persona offline three-role story structure audit',()=>{
 it('detects missing drama, acting action and hook without claiming artistic intelligence',()=>{
  const result=assessPersonaStory(EMPTY_PERSONA_STORY);
  expect(result.status).toBe('structurally-incomplete');
  expect(result.issues).toHaveLength(9);
  expect(result.roleStatus).toEqual({
   dramaturg:'needs-work',director:'needs-work',producer:'needs-work'
  });
  expect(result.notice).toMatch(/Не оценивает юмор/);
 });
 it('returns human-review status only after all mechanical fields exist',()=>{
  const result=assessPersonaStory(complete);
  expect(result.issues).toEqual([]);
  expect(result.status).toBe('ready-for-human-editor');
  expect(result.notice).toMatch(/художественный вердикт/);
 });
 it('flags identical desire and obstacle as false dramaturgical conflict',()=>{
  const result=assessPersonaStory({...complete,obstacle:complete.protagonistGoal});
  expect(result.issues.some(x=>x.field==='obstacle'&&x.role==='dramaturg')).toBe(true);
 });
 it('flags indistinguishable turn and payoff',()=>{
  const result=assessPersonaStory({...complete,payoff:complete.turn});
  expect(result.issues.some(x=>x.field==='turn')).toBe(true);
 });
 it('warns about overlong first seconds',()=>{
  const result=assessPersonaStory({...complete,hook:'Происходит сложная ситуация '.repeat(10)});
  expect(result.issues.some(x=>x.role==='producer'&&x.field==='hook')).toBe(true);
 });
 it('exports author words unchanged rather than inventing dialogue or events',()=>{
  const formatted=formatPersonaStoryAngle(complete);
  expect(formatted).toContain('Ситуация: '+complete.premise);
  expect(formatted).toContain('Цель героя: '+complete.protagonistGoal);
  expect(formatted).toContain('Финал: '+complete.payoff);
  expect(formatted).not.toContain('млн просмотров');
 });
});
