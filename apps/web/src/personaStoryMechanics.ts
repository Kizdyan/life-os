/**
 * Offline structural editorial checks. No AI model, simulated audience metrics
 * or claim to understand whether a joke is genuinely funny.
 * Deliberately keeps the author's wording intact.
 */
export type PersonaEditorRole='dramaturg'|'director'|'producer';
export interface PersonaStoryOutline{
 premise:string;
 hook:string;
 protagonistGoal:string;
 obstacle:string;
 escalation:string;
 turn:string;
 payoff:string;
 actingAction:string;
 visualMoment:string;
}
export interface PersonaStoryIssue{
 role:PersonaEditorRole;
 field:keyof PersonaStoryOutline;
 message:string;
}
export interface PersonaStoryAssessment{
 status:'structurally-incomplete'|'ready-for-human-editor';
 issues:PersonaStoryIssue[];
 roleStatus:Record<PersonaEditorRole,'needs-work'|'ready-for-human-editor'>;
 notice:string;
}
export const EMPTY_PERSONA_STORY:PersonaStoryOutline={
 premise:'',hook:'',protagonistGoal:'',obstacle:'',escalation:'',turn:'',
 payoff:'',actingAction:'',visualMoment:''
};
const requirements:Array<{role:PersonaEditorRole;field:keyof PersonaStoryOutline;label:string}>=
 [
  {role:'dramaturg',field:'premise',label:'Конкретная ситуация персонажа'},
  {role:'dramaturg',field:'protagonistGoal',label:'Чего герой добивается'},
  {role:'dramaturg',field:'obstacle',label:'Что реально мешает герою'},
  {role:'dramaturg',field:'escalation',label:'Как конфликт усложняется'},
  {role:'dramaturg',field:'turn',label:'Что меняет ситуацию'},
  {role:'dramaturg',field:'payoff',label:'Чем заканчивается ситуация'},
  {role:'director',field:'actingAction',label:'Что актёр делает для достижения цели'},
  {role:'director',field:'visualMoment',label:'Что зритель увидит в кадре'},
  {role:'producer',field:'hook',label:'Что заставляет смотреть первые секунды'}
 ];
function normalized(value:unknown):string{return typeof value==='string'?value.trim().replace(/\s+/gu,' '):''}
export function assessPersonaStory(input:PersonaStoryOutline):PersonaStoryAssessment{
 const issues:PersonaStoryIssue[]=[];
 const add=(role:PersonaEditorRole,field:keyof PersonaStoryOutline,message:string)=>issues.push({role,field,message});
 for(const requirement of requirements){
  if(normalized(input[requirement.field]).length<8)
   add(requirement.role,requirement.field,'Недостаточно конкретно: '+requirement.label.toLowerCase()+'.');
 }
 if(normalized(input.hook).length>180)
  add('producer','hook','Хук слишком длинный для быстрого прочтения: уточни, что происходит в первые секунды.');
 if(normalized(input.payoff).length>350)
  add('dramaturg','payoff','Финал описан слишком длинно: сформулируй конкретное событие или действие.');
 if(normalized(input.protagonistGoal).toLowerCase()===normalized(input.obstacle).toLowerCase()&&normalized(input.obstacle))
  add('dramaturg','obstacle','Цель и препятствие совпадают. Нужно указать силу, мешающую герою.');
 if(normalized(input.turn).toLowerCase()===normalized(input.payoff).toLowerCase()&&normalized(input.turn))
  add('dramaturg','turn','Поворот совпадает с финалом: проверь, есть ли развитие перед развязкой.');
 const roles:PersonaEditorRole[]=['dramaturg','director','producer'];
 const roleStatus=Object.fromEntries(roles.map(role=>[role,issues.some(i=>i.role===role)?'needs-work':'ready-for-human-editor'])) as PersonaStoryAssessment['roleStatus'];
 return {
  status:issues.length?'structurally-incomplete':'ready-for-human-editor',
  issues,roleStatus,
  notice:'Формальная проверка полноты, а не художественный вердикт. Не оценивает юмор, оригинальность, достоверность тренда или реальное удержание зрителя.'
 };
}
export function formatPersonaStoryAngle(outline:PersonaStoryOutline):string{
 const text=(key:keyof PersonaStoryOutline)=>normalized(outline[key]);
 return [
  'Ситуация: '+text('premise'),
  'Начало: '+text('hook'),
  'Цель героя: '+text('protagonistGoal'),
  'Препятствие: '+text('obstacle'),
  'Эскалация: '+text('escalation'),
  'Поворот: '+text('turn'),
  'Финал: '+text('payoff'),
  'Актёрская задача: '+text('actingAction'),
  'Визуальное решение: '+text('visualMoment')
 ].join('\n');
}
