import React from 'react';

/** UI-only grouping: keep existing persisted workspace steps and drafts intact. */
export type PersonaMvpWorkspaceStep='guide'|'idea'|'script'|'assets'|'edit'|'review'|'export';
export const REEL_MVP_STEPS:readonly (readonly [PersonaMvpWorkspaceStep,string])[]=[
 ['idea','Идея'],
 ['script','Сценарий'],
 ['guide','Съёмка'],
 ['edit','Монтаж'],
 ['review','Выпуск'],
];

/** Seven older internal states are deliberately presented as five user stages. */
export function reelMvpIndex(step:PersonaMvpWorkspaceStep):number{
 switch(step){
  case 'idea':return 0;
  case 'script':return 1;
  case 'guide':
  case 'assets':return 2;
  case 'edit':return 3;
  case 'review':
  case 'export':return 4;
 }
}

export default function PersonaMvpSteps({step,onSelect}:{
 step:PersonaMvpWorkspaceStep;
 onSelect:(next:PersonaMvpWorkspaceStep)=>void;
}){
 const active=reelMvpIndex(step);
 return <nav className="personaWorkspaceSteps personaMvpSteps" aria-label="Пять этапов создания Reels">
  {REEL_MVP_STEPS.map(([id,label],index)=><button key={id} type="button"
   className={active===index?'current':''}
   aria-current={active===index?'step':undefined}
   onClick={()=>onSelect(id)}>
   <span>{index+1}</span>{label}
  </button>)}
 </nav>;
}
