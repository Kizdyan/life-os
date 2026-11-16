import {describe,it,expect} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createPersonaProject,savePersonaProject,loadPersonaProjects,PERSONA_PROJECTS_KEY,type PersonaProjectStorage} from './personaProjectStore';
import {PERSONA_DEMO_ID,buildPersonaDemoBrief,ensurePersonaDemoProject} from './personaDemoProject';
import {PersonaCreativeProjectCard} from './PersonaCreativeProjectCard';
import {creativeProjectAction} from './personaCreativeStudio';

function storage():PersonaProjectStorage{
 const data=new Map<string,string>();
 return {getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)},removeItem:key=>{data.delete(key)}};
}

describe('Persona three-scene demo',()=>{
 it('creates a validated sample containing exactly three scenes and three shots',()=>{
  const brief=buildPersonaDemoBrief();
  expect(brief.script).toHaveLength(3);
  expect(brief.shots).toHaveLength(3);
  expect(brief.script[0].line).toContain('пианино');
  expect(brief.script[1].line).toContain('Взгляд в камеру');
  expect(brief.script.reduce((sum,item)=>sum+item.durationSec,0)).toBe(16);
  expect(brief.shots.map(shot=>shot.order)).toEqual([1,2,3]);
 });
 it('adds an isolated project without deleting or selecting over an existing real project',()=>{
  const s=storage(),now='2026-11-16T12:00:00.000Z';
  const existing=createPersonaProject({id:'user-owned-project',title:'Настоящий проект',contentType:'reel',sourceIdea:'My source idea',now});
  savePersonaProject(s,existing,existing.id);
  const initial=s.getItem(PERSONA_PROJECTS_KEY);
  const result=ensurePersonaDemoProject(s,now);
  expect(result.created).toBe(true);
  expect(result.collection.projects).toHaveLength(2);
  expect(result.collection.activeProjectId).toBe(existing.id);
  expect(result.collection.projects[0]).toEqual(existing);
  expect(result.project.id).toBe(PERSONA_DEMO_ID);
  expect(result.project.lastOpenStep).toBe('script');
  expect(result.project.stage).toBe('strategy');
  expect(result.project.mediaAssets).toEqual([]);
  expect(result.project.shootingPlan).toMatchObject({stage:'QA',statuses:{READY_FOR_SHOOT:'pending'}});
  expect(result.project.scenarioWorkspace?.script?.currentRevision.beats).toHaveLength(3);
  expect(initial).not.toEqual(s.getItem(PERSONA_PROJECTS_KEY));
  const saved=loadPersonaProjects(s,()=> 'unused').projects.find(p=>p.id===PERSONA_DEMO_ID)!;
  const card=renderToStaticMarkup(<PersonaCreativeProjectCard project={saved} onContinue={()=>{}}/>);
  expect(card).toContain('Продолжить сценарий');
  expect(card).toContain('ДЕМО');
  expect(creativeProjectAction(saved).status).toBe('Идея');
 });
 it('is idempotent, preserves a user edited demo and does not change project storage on re-open',()=>{
  const s=storage();
  const first=ensurePersonaDemoProject(s,'2026-11-16T12:00:00.000Z');
  const changed={...first.project,title:'Мой отредактированный пример',revision:2};
  savePersonaProject(s,changed,changed.id);
  const snapshot=s.getItem(PERSONA_PROJECTS_KEY);
  const second=ensurePersonaDemoProject(s,'2026-11-17T12:00:00.000Z');
  expect(second.created).toBe(false);
  expect(second.project.title).toBe(changed.title);
  expect(s.getItem(PERSONA_PROJECTS_KEY)).toBe(snapshot);
 });
});
