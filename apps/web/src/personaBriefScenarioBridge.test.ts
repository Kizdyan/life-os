import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importPersonaProductionBrief } from '../../../packages/core/src/persona-production-pipeline';
import { approveScenarioScript } from '../../../packages/core/src/persona-scenario-intelligence';
import { createPersonaProject, loadPersonaProjects, savePersonaProject } from './personaProjectStore';
import { addImportedBriefScenario } from './personaBriefScenarioBridge';

const brief = JSON.parse(readFileSync(new URL('../../../docs/persona-delivery/candidate-production-brief.json', import.meta.url), 'utf8'));
const project = createPersonaProject({ id: 'actor-composer', title: brief.sourceTitle, contentType: 'reel', sourceIdea: brief.sourceAngle, now: '2026-10-31T10:00:00.000Z' });
const checked = importPersonaProductionBrief({ brief, selectedIdea: { id: project.id, title: project.title, angle: project.sourceIdea, format: project.contentType } }).materials.productionBrief!;

describe('Production Brief to Scenario Workspace', () => {
  it('creates a persistent unapproved candidate with the seven exact scenes', () => {
    const workspace = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    expect(workspace.script?.currentRevision.beats.map(beat => beat.line)).toEqual(brief.script.map((beat: {line:string}) => beat.line));
    expect(workspace.script?.currentRevision.beats.reduce((sum, beat) => sum + beat.durationSec, 0)).toBe(31);
    expect(workspace.script?.approval).toBeUndefined();
    const data = new Map<string,string>();
    const storage = { getItem: (key:string) => data.get(key) ?? null, setItem: (key:string,value:string) => { data.set(key,value); }, removeItem: (key:string) => { data.delete(key); } };
    savePersonaProject(storage, { ...project, scenarioWorkspace: workspace, shootingPlan: { materials: { productionBrief: checked } }, revision: 2 });
    expect(loadPersonaProjects(storage, () => 'unused').projects[0].scenarioWorkspace?.script?.currentRevision.beats).toHaveLength(7);
  });

  it('appends to an existing script and keeps older revisions while removing approval', () => {
    const first = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    const approved = approveScenarioScript(first.script!, { author: 'Author', comment: 'Approved earlier wording', approvedAt: '2026-10-31T10:02:00.000Z' });
    const changed = { ...checked, script: checked.script.map((beat, index) => index === 0 ? { ...beat, line: 'Новая первая реплика.' } : beat) };
    const next = addImportedBriefScenario({ ...first, script: approved }, changed, '2026-10-31T10:03:00.000Z');
    expect(next.script?.revisions).toHaveLength(2);
    expect(next.script?.revisions[0].beats[0].line).toBe(brief.script[0].line);
    expect(next.script?.currentRevision.beats[0].line).toBe('Новая первая реплика.');
    expect(next.script?.approval).toBeUndefined();
    expect(addImportedBriefScenario(next, changed, '2026-10-31T10:04:00.000Z').script?.revisions).toHaveLength(2);
    expect(() => addImportedBriefScenario(next, checked, '2026-10-31T10:05:00.000Z')).toThrow(/старую версию/i);
  });

  it('enforces author-locked spoken lines across imports while allowing other changes', () => {
    const first = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    const projectId = first.script!.idea.id;
    const pinned = {
      ...first,
      authorLockedLines: [
        {ideaId: projectId,index:0,line:first.script!.currentRevision.beats[0].line},
        {ideaId: projectId,index:1,line:first.script!.currentRevision.beats[1].line},
      ],
    };
    const rewrittenA01 = {
      ...checked,
      script: checked.script.map((beat,index) => index===0 ? {...beat,line:'Незаметная замена A01'} : beat),
    };
    expect(() => addImportedBriefScenario(pinned,rewrittenA01,'2026-10-31T10:02:00.000Z')).toThrow(/Закреплённая автором реплика кадра 1/);
    const newA03 = {
      ...checked,
      script: checked.script.map((beat,index) => index===4 ? {...beat,line:'Новая авторская редакция A03'} : beat),
    };
    const accepted = addImportedBriefScenario(pinned,newA03,'2026-10-31T10:03:00.000Z');
    expect(accepted.script?.revisions).toHaveLength(2);
    expect(accepted.authorLockedLines).toEqual(pinned.authorLockedLines);
    expect(accepted.script?.currentRevision.beats[0].line).toBe(brief.script[0].line);
    expect(accepted.script?.approval).toBeUndefined();
    // Explicit author unlock is the only way this locked A01 can be revised.
    const unlocked = {...accepted,authorLockedLines:accepted.authorLockedLines!.filter(x=>x.index!==0)};
    const changedA01 = {...newA03,script:newA03.script.map((beat,index)=>index===0?{...beat,line:'Разблокированная автором реплика'}:beat)};
    const revised = addImportedBriefScenario(unlocked,changedA01,'2026-10-31T10:04:00.000Z');
    expect(revised.script?.revisions).toHaveLength(3);
  });

  it('persists author-pinned dialogue metadata through Persona project storage', () => {
    const first = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    const pinned = {...first,authorLockedLines:[{
      ideaId:first.script!.idea.id,index:0,line:first.script!.currentRevision.beats[0].line,
    }]};
    const map = new Map<string,string>();
    const storage = {
      getItem: (key:string)=>map.get(key)??null,
      setItem: (key:string,value:string)=>{map.set(key,value);},
      removeItem: (key:string)=>{map.delete(key);},
    };
    savePersonaProject(storage,{...project,scenarioWorkspace:pinned,revision:2});
    const reloaded = loadPersonaProjects(storage,()=> 'unused').projects[0].scenarioWorkspace;
    expect(reloaded?.authorLockedLines).toEqual(pinned.authorLockedLines);
    const attempted={...checked,script:checked.script.map((beat,index)=>index===0?{...beat,line:'Forbidden'}:beat)};
    expect(()=>addImportedBriefScenario(reloaded,attempted,'2026-10-31T10:05:00.000Z')).toThrow(/Закреплённая автором/);
  });

  it('rejects an unrelated saved script without replacing its history', () => {
    const first = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    const unrelated = { ...first, script: { ...first.script!, idea: { ...first.script!.idea, id: 'other-idea' } } };
    expect(() => addImportedBriefScenario(unrelated, checked, '2026-10-31T10:02:00.000Z')).toThrow(/другой идеи/i);
    expect(unrelated.script.currentRevision.beats[0].line).toBe(brief.script[0].line);
  });
});
