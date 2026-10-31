import type { PersonaProductionBrief } from '../../../packages/core/src/persona-production-brief';
import { createScenarioScript, reviseScenarioScript, type ScenarioIdea, type ScenarioScriptBeat } from '../../../packages/core/src/persona-scenario-intelligence';
import type { PersonaScenarioWorkspace } from './personaProjectStore';

type ProtectedBeat = NonNullable<PersonaScenarioWorkspace['protectedBeats']>[number];
const sameBeat=(beat:ScenarioScriptBeat,lock:ProtectedBeat)=>beat.line===lock.line&&beat.action===lock.action&&beat.durationSec===lock.durationSec;
const importedReason='Импорт съёмочного брифа JSON · редакторский кандидат, автором не утверждён.';

/** Explicit author action; importing a file alone cannot alter protected project beats. */
export function unlockImportedBriefBeats(workspace:PersonaScenarioWorkspace,input:{indices:number[];author:string;unlockedAt:string}):PersonaScenarioWorkspace{
 if(!input.author.trim())throw new Error('Для разблокирования закреплённой сцены укажите автора.');
 const requested=new Set(input.indices);
 if(!requested.size||[...requested].some(index=>!Number.isInteger(index)||index<0))throw new Error('Укажите хотя бы одну закреплённую сцену для разблокирования.');
 let changed=false;
 const protectedBeats=(workspace.protectedBeats??[]).map(lock=>{
  if(!requested.has(lock.index)||lock.unlockedAt)return lock;
  changed=true;return {...lock,unlockedAt:input.unlockedAt,unlockedBy:input.author.trim()};
 });
 if(!changed)throw new Error('Выбранные сцены уже разблокированы или не закреплены в этом проекте.');
 return {...workspace,protectedBeats};
}

/** Receives a brief only after the canonical Production Brief import has validated it. */
export function addImportedBriefScenario(workspace: PersonaScenarioWorkspace | undefined, brief: PersonaProductionBrief, createdAt: string): PersonaScenarioWorkspace {
  const current = workspace ?? { version: 1 as const, research: [], analyses: [], ideas: [] };
  const beats: ScenarioScriptBeat[] = brief.script.map((beat, index) => ({
    purpose: index === 0 ? 'hook' : index === brief.script.length - 1 ? 'ending' : 'development',
    line: beat.line, action: beat.action, durationSec: beat.durationSec,
  }));
  for(const lock of current.protectedBeats??[]){
    if(lock.unlockedAt)continue;
    if(!beats[lock.index]||!sameBeat(beats[lock.index],lock))throw new Error(`Закреплённая сцена ${lock.index+1} изменена импортом. Сначала автор должен явно разблокировать её в этом проекте.`);
  }
  if (current.script) {
    if (current.script.idea.id !== `imported-brief-${brief.ideaId}`) throw new Error('В проекте сохранён сценарий другой идеи. Импорт отклонён, история сохранена.');
    if (JSON.stringify(current.script.currentRevision.beats) === JSON.stringify(beats)) return current;
    if (current.script.revisions.some(revision => JSON.stringify(revision.beats) === JSON.stringify(beats))) {
      throw new Error('Файл содержит старую версию сценария. Импорт отклонён, текущие правки сохранены.');
    }
    if (!current.script.currentRevision.reason?.startsWith('Импорт съёмочного брифа JSON')) {
      throw new Error('Текущий сценарий изменён после импорта. Сохраните новый кандидат через редакторскую проверку.');
    }
    return { ...current, script: reviseScenarioScript(current.script, {
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
  const protectedBeats:ProtectedBeat[]=beats.slice(0,2).map((beat,index)=>({index,line:beat.line,action:beat.action,durationSec:beat.durationSec,lockedAt:createdAt}));
  return { ...current, ideas: [...current.ideas, idea], selectedIdeaId: idea.id,
    script: { ...script, revisions: [first], currentRevision: first }, protectedBeats };
}
