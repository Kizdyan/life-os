import React,{useState} from 'react';
import {
 EMPTY_PERSONA_STORY,assessPersonaStory,formatPersonaStoryAngle,
 type PersonaStoryOutline
} from './personaStoryMechanics';

const fields:Array<{field:keyof PersonaStoryOutline;label:string;example:string;role:string}>=[
 {field:'premise',label:'Обстоятельства',example:'Что случилось и кому? Конкретная ситуация, не тема.',role:'Драматург'},
 {field:'hook',label:'Первые секунды',example:'Что зритель видит или слышит сразу?',role:'Продюсер'},
 {field:'protagonistGoal',label:'Цель героя',example:'Какого конкретного результата хочет персонаж?',role:'Драматург'},
 {field:'obstacle',label:'Препятствие',example:'Что мешает достичь цели прямо сейчас?',role:'Драматург'},
 {field:'escalation',label:'Осложнение',example:'Как ситуация становится хуже из-за действия персонажа?',role:'Драматург'},
 {field:'turn',label:'Поворот',example:'Какое событие меняет ожидание зрителя?',role:'Драматург'},
 {field:'payoff',label:'Развязка / панчлайн',example:'Что реально происходит в конце? Не просто фраза «смешной финал».',role:'Драматург'},
 {field:'actingAction',label:'Актёрская задача',example:'Чего добиваешься от другого человека в кадре?',role:'Режиссёр'},
 {field:'visualMoment',label:'Действие в кадре',example:'Что можно показать вместо объяснения словами?',role:'Режиссёр'}
];
const roleNames={dramaturg:'Драматург',director:'Режиссёр',producer:'Продюсер'} as const;
export default function PersonaStoryReview({initial,onChange,onCreate,referenceStatus}:{
 initial?:PersonaStoryOutline;
 onChange:(value:PersonaStoryOutline)=>void;
 onCreate:(angle:string,outline:PersonaStoryOutline)=>void;
 referenceStatus:'link-only'|'human-reviewed';
}){
 const [outline,setOutline]=useState<PersonaStoryOutline>(()=>({...EMPTY_PERSONA_STORY,...initial}));
 const assessment=assessPersonaStory(outline);
 function update(field:keyof PersonaStoryOutline,value:string){
  const next={...outline,[field]:value.slice(0,1200)};
  setOutline(next);onChange(next);
 }
 return <div className="personaStoryReview" aria-label="Сценарный разбор без кредитов">
  <h4>Драматургический конструктор</h4>
  <p>Это не генерация ИИ: ты описываешь будущую сцену, а Persona проверяет полноту конструкции. Художественная оригинальность и юмор требуют отдельной редакторской проверки.</p>
  {referenceStatus==='link-only'&&<p className="radarMessage">Исходный ролик ещё не отмечен как просмотренный. Любые выводы о его сценах — только гипотезы.</p>}
  <div className="personaStoryFields">{fields.map(field=><label key={field.field}>{field.label}
   <small>{field.role}</small>
   <textarea value={outline[field.field]} aria-label={field.label} maxLength={1200}
    onChange={event=>update(field.field,event.target.value)} placeholder={field.example}/>
  </label>)}</div>
  <section className="personaStoryAudit" aria-label="Формальная редакторская проверка">
   <strong>{assessment.status==='structurally-incomplete'?'Структура требует доработки':'Структура заполнена · требуется художественная редактура'}</strong>
   {(['dramaturg','director','producer'] as const).map(role=><div key={role}>
    <b>{roleNames[role]} · {assessment.roleStatus[role]==='needs-work'?'есть замечания':'формальные поля заполнены'}</b>
    {assessment.issues.filter(issue=>issue.role===role).map((issue,i)=><p key={issue.field+i}>{issue.message}</p>)}
   </div>)}
   <small>{assessment.notice}</small>
  </section>
  <button type="button" disabled={assessment.status!=='ready-for-human-editor'} onClick={()=>onCreate(formatPersonaStoryAngle(outline),outline)}>
   Перенести структуру в новый проект Persona
  </button>
  {assessment.status!=='ready-for-human-editor'&&<small>Сначала заполни недостающие драматургические опоры. Эта проверка не даёт разрешения на съёмку или публикацию.</small>}
 </div>;
}
