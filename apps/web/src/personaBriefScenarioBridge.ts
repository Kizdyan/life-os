import type { PersonaProductionBrief } from '../../../packages/core/src/persona-production-brief';
import { createScenarioScript, reviseScenarioScript, type ScenarioIdea, type ScenarioScriptBeat } from '../../../packages/core/src/persona-scenario-intelligence';
import type { PersonaScenarioWorkspace } from './personaProjectStore';

const importedReason='Импорт съёмочного брифа JSON · редакторский кандидат, автором не утверждён.';

/** Production briefs can carry an explicit author instruction to retain a line unchanged. */
function briefAuthorLocks(brief: PersonaProductionBrief, ideaId: string) {
  return brief.script.flatMap((beat, index) =>
    /\b[A-Z]\d{2}\s*[—-]\s*без изменений/i.test(beat.action)
      ? [{ ideaId, index, line: beat.line }]
      : [],
  );
}

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
  const beats: ScenarioScriptBeat[] = brief.script.map((beat, index) => {
    const cue=brief.preEditPlan?.scenes[index];
    const matchingCue=cue?.order===index+1&&cue.line===beat.line&&
      cue.durationSec===beat.durationSec&&typeof cue.editIntent==='string'&&
      cue.editIntent.trim().length>0;
    return {
      purpose: index === 0 ? 'hook' : index === brief.script.length - 1 ? 'ending' : 'development',
      line: beat.line, action: beat.action, durationSec: beat.durationSec,
      // This remains unapproved planning material until separate author review.
      ...(matchingCue?{editIntent:cue.editIntent.trim()}:{}),
    };
  });
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
    const locks = [...(current.authorLockedLines ?? [])];
    for (const lock of briefAuthorLocks(brief, current.script.idea.id)) {
      if (!locks.some(existing => existing.ideaId === lock.ideaId && existing.index === lock.index)) locks.push(lock);
    }
    return { ...current, authorLockedLines: locks.length ? locks : undefined, script: reviseScenarioScript(current.script, {
      createdAt, beats, reason: importedReason,
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
  const first = { ...script.currentRevision, reason: importedReason };
  const locks = briefAuthorLocks(brief, idea.id);
  return { ...current, ideas: [...current.ideas, idea], selectedIdeaId: idea.id,
    authorLockedLines: locks.length ? locks : undefined,
    script: { ...script, revisions: [first], currentRevision: first } };
}
