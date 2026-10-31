import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importPersonaProductionBrief } from '../../../packages/core/src/persona-production-pipeline';
import { approveScenarioScript } from '../../../packages/core/src/persona-scenario-intelligence';
import { createPersonaProject, loadPersonaProjects, savePersonaProject } from './personaProjectStore';
import { addImportedBriefScenario, unlockImportedBriefBeats } from './personaBriefScenarioBridge';

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
    const changed = { ...checked, script: checked.script.map((beat, index) => index === 2 ? { ...beat, line: 'Новая третья реплика.' } : beat) };
    const next = addImportedBriefScenario({ ...first, script: approved }, changed, '2026-10-31T10:03:00.000Z');
    expect(next.script?.revisions).toHaveLength(2);
    expect(next.script?.revisions[0].beats[0].line).toBe(brief.script[0].line);
    expect(next.script?.currentRevision.beats[2].line).toBe('Новая третья реплика.');
    expect(next.script?.approval).toBeUndefined();
    expect(addImportedBriefScenario(next, changed, '2026-10-31T10:04:00.000Z').script?.revisions).toHaveLength(2);
    expect(() => addImportedBriefScenario(next, checked, '2026-10-31T10:05:00.000Z')).toThrow(/старую версию/i);
  });

  it('rejects a changed protected beat until an author explicitly unlocks that project beat', () => {
    const first = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    const changed = { ...checked, script: checked.script.map((beat, index) => index === 0 ? { ...beat, line: 'Новая первая реплика.' } : beat) };
    expect(() => addImportedBriefScenario(first, changed, '2026-10-31T10:02:00.000Z')).toThrow(/закрепл/i);
    const unlocked = unlockImportedBriefBeats(first, { indices: [0], author: 'Автор', unlockedAt: '2026-10-31T10:03:00.000Z' });
    const next = addImportedBriefScenario(unlocked, changed, '2026-10-31T10:04:00.000Z');
    expect(next.script?.currentRevision.beats[0].line).toBe('Новая первая реплика.');
    expect(next.script?.approval).toBeUndefined();
  });

  it('rejects an unrelated saved script without replacing its history', () => {
    const first = addImportedBriefScenario(undefined, checked, '2026-10-31T10:01:00.000Z');
    const unrelated = { ...first, script: { ...first.script!, idea: { ...first.script!.idea, id: 'other-idea' } } };
    expect(() => addImportedBriefScenario(unrelated, checked, '2026-10-31T10:02:00.000Z')).toThrow(/другой идеи/i);
    expect(unrelated.script.currentRevision.beats[0].line).toBe(brief.script[0].line);
  });
});
