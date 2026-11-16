import React from 'react';
import {creativeProjectAction} from './personaCreativeStudio';
import type {PersonaProject} from './personaProjectStore';

export function PersonaCreativeProjectCard({project,onContinue}:{
 project:PersonaProject;onContinue:(project:PersonaProject)=>void;
}){
 const state=creativeProjectAction(project);
 const format=({reel:'REELS',short:'SHORTS',story:'STORY',photo:'PHOTO',carousel:'CAROUSEL'} as const)[project.contentType];
 return <article className="personaCreativeCard" data-testid="persona-creative-card">
  <div className={'personaCreativeCover personaCreativeCover--'+project.contentType} aria-hidden="true">
   <span className="personaCreativeCoverCorner">P / STUDIO</span>
   <span className="personaCreativeCoverMonogram">{project.title.trim().slice(0,1).toLocaleUpperCase('ru-RU')||'P'}</span>
   <span className="personaCreativeCoverFormat">{format}</span>
  </div>
  <div className="personaCreativeCardContent">
   <div className="personaCreativeCardMeta"><span>{format}</span><span className="personaCreativeStatus">{state.status}</span></div>
   <h3>{project.title}</h3>
   <p>Последнее изменение: {new Date(project.updatedAt).toLocaleDateString('ru-RU')}</p>
   <button type="button" className="personaCreativeCardAction" onClick={()=>onContinue(project)}>
    {state.action}<span aria-hidden="true">↗</span>
   </button>
  </div>
 </article>;
}
