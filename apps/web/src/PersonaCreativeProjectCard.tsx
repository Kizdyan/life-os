import React from 'react';
import {creativeProjectAction} from './personaCreativeStudio';
import type {PersonaProject} from './personaProjectStore';
import {currentPersonaStrategyAudit,PERSONA_STRATEGY_FIELDS,isPersonaStrategy} from '../../../packages/core/src/persona-strategy.mjs';

export function PersonaCreativeProjectCard({project,onContinue}:{
 project:PersonaProject;onContinue:(project:PersonaProject)=>void;
}){
 const state=creativeProjectAction(project);
 const strategy=isPersonaStrategy(project.strategy)?project.strategy:null;
 const audit=currentPersonaStrategyAudit(project);
 const warning=audit?.status==='WARNING';
 const blocked=audit?.status==='BLOCKED';
 const format=({reel:'REELS',short:'SHORTS',story:'STORY',photo:'PHOTO',carousel:'CAROUSEL'} as const)[project.contentType];
 return <article className={'personaCreativeCard'+(warning?' personaCreativeCard--strategyWarning':blocked?' personaCreativeCard--strategyBlocked':'')} data-testid="persona-creative-card" data-strategy-status={audit?.status??'NOT_CHECKED'}>
  <div className={'personaCreativeCover personaCreativeCover--'+project.contentType} aria-hidden="true">
   <span className="personaCreativeCoverCorner">P / STUDIO</span>
   <span className="personaCreativeCoverMonogram">{project.title.trim().slice(0,1).toLocaleUpperCase('ru-RU')||'P'}</span>
   <span className="personaCreativeCoverFormat">{format}</span>
  </div>
  <div className="personaCreativeCardContent">
   <div className="personaCreativeCardMeta"><span>{format}</span><span className="personaCreativeStatus">{state.status}</span></div>
   <h3>{project.title}</h3>
   <p>Последнее изменение: {new Date(project.updatedAt).toLocaleDateString('ru-RU')}</p>
   {strategy&&<div className="personaCreativeStrategyTags" aria-label="Семь элементов стратегии">
    {PERSONA_STRATEGY_FIELDS.map(([key,label,icon])=><span key={key} title={strategy[key]} aria-label={label+': '+strategy[key]}><span aria-hidden="true">{icon}</span>{label}</span>)}
   </div>}
   {warning&&<div className="personaCreativeStrategyAlert" role="alert"><strong>Внимание: этот сценарий может не привлечь индустрию</strong><span>{audit!.recommendation}</span></div>}
   {blocked&&<div className="personaCreativeStrategyAlert personaCreativeStrategyAlert--blocked" role="alert"><strong>Стратегическая проверка: требуется переработка</strong><span>{audit!.recommendation}</span></div>}
   {!audit&&strategy&&<span className="personaCreativeStrategyUnchecked">Стратегия заполнена · ИИ-анализ ещё не выполнен</span>}
   <button type="button" className="personaCreativeCardAction" onClick={()=>onContinue(project)}>
    {state.action}<span aria-hidden="true">↗</span>
   </button>
  </div>
 </article>;
}
