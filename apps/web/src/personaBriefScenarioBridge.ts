import type { PersonaProductionBrief } from '../../../packages/core/src/persona-production-brief';
import { createScenarioScript, reviseScenarioScript, type ScenarioIdea, type ScenarioScriptBeat } from '../../../packages/core/src/persona-scenario-intelligence';
import type { PersonaScenarioWorkspace } from './personaProjectStore';

/** Rejects edits to exact spoken lines the author explicitly pinned in THIS idea. */
export function assertPersonaAuthorLockedLines(
 workspace: PersonaScenarioWorkspace,
 beats: readonly ScenarioScriptBeat[],
 ideaId: string,
): void {
 const locks=workspace.authorLockedLines??[];
 for(const lock of locks){
  if(lock.ideaId!==ideaId)continue;
  if(!Number.isInteger(lock.index)||lock.index<0||lock.index>=beats.length||
      beats[lock.index]?.line!==lock.line)
   throw new Error('Закреплённая автором реплика кадра '+(lock.index+1)+' изменена. Сначала явно снимите закрепление в редакторе сценария.');
 }
}

/** Receives a brief only after the canonical Production Brief import has validated it. */
export function addImportedBriefScenario(workspace: PersonaScenarioWorkspace | undefined, brief: PersonaProductionBrief, createdAt: string): PersonaScenarioWorkspace {
  const current = workspace ?? { version: 1 as const, research: [], analyses: [], ideas: [] };
  const beats: ScenarioScriptBeat[] = brief.script.map((beat, index) => ({
    purpose: index === 0 ? 'hook' : index === brief.script.length - 1 ? 'ending' : 'development',
    line: beat.line, action: beat.action, durationSec: beat.durationSec,
  }));
  if (current.script) {
    if (current.script.idea.id !== `imported-brief-${brief.ideaId}`) throw new Error('В проекте сохранён сценарий другой идеи. Импорт отклонён, история сохранена.');
    assertPersonaAuthorLockedLines(current,beats,current.script.idea.id);
    if (JSON.stringify(current.script.currentRevision.beats) === JSON.stringify(beats)) return current;
    if (current.script.revisions.some(revision => JSON.stringify(revision.beats) === JSON.stringify(beats))) {
      throw new Error('Файл содержит старую версию сценария. Импорт отклонён, текущие правки сохранены.');
    }
    if (!current.script.currentRevision.reason?.startsWith('Импорт съёмочного брифа JSON')) {
      throw new Error('Текущий сценарий изменён после импорта. Сохраните новый кандидат через редакторскую проверку.');
    }
    return { ...current, script: reviseScenarioScript(current.script, {
      createdAt, beats, reason: 'Импорт съёмочного брифа JSON · редакторский кандидат, автором не утверждён.',
    }) };
  }
  const idea: ScenarioIdea = {
    id: `imported-brief-${brief.ideaId}`, title: brief.sourceTitle, referenceIds: [],
    originalConflict: brief.sourceAngle, actingTask: 'Проверить действие в импортированных сценах.',
    ending: brief.script[brief.script.length - 1].line, productionComplexity: 'medium',
    estimatedDurationSec: beats.reduce((sum, beat) => sum + beat.durationSec, 0),
    creativeProfileFit: 'Требует редакторской проверки автором.', origin: 'template_fallback',
    evidenceNote: 'Импортирован из съёмочного брифа JSON; просмотр референсов и авторское утверждение не подтверждены.',
  };
  const script = createScenarioScript(idea, { createdAt, beats, sourceFacts: brief.factReferences });
  const first = { ...script.currentRevision, reason: 'Импорт съёмочного брифа JSON · редакторский кандидат, автором не утверждён.' };
  return { ...current, ideas: [...current.ideas, idea], selectedIdeaId: idea.id,
    script: { ...script, revisions: [first], currentRevision: first } };
}
