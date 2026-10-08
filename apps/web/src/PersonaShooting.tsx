import { useState } from 'react';
import ShootingBriefScreen from './ShootingBriefScreen';
import { personaEdgeRequest } from './edgeRuntimeClient';
import { validatePersonaShootingBrief } from '../../../supabase/functions/life-os-runtime-prototype-v3/quality-gates';
import type { PersonaIdea, PersonaShootingBrief, PersonaShootingResult } from './personaIdeaState';

interface Props {
  approvalProof: string;
  idea: PersonaIdea;
  brief: PersonaShootingBrief | null;
  result: PersonaShootingResult | null;
  onBrief: (brief: PersonaShootingBrief) => void;
  onResult: (result: { completedAt: string; shotIds: string[] }) => void;
}

function shootingFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('shooting_brief_quality_failed') || message.includes('invalid_shooting_brief')) {
    return 'Съёмочное задание не прошло проверку качества. Оно не будет показано как готовое — можно повторить генерацию.';
  }
  if (message.includes('ai_quota_unavailable') || message.includes('openai_failed:429')) {
    return 'AI-сервис временно недоступен из-за лимита API. Идея сохранена, но съёмочное задание пока не подтверждено.';
  }
  if (message.includes('idea_approval_required')) {
    return 'Съёмка доступна только для ранее подтверждённой идеи. Необходимо новое подтверждение runtime.';
  }
  if (message.includes('authentication_required') || message.includes('session')) {
    return 'Сессия Persona закончилась. Подключи runtime заново, прежде чем создавать съёмочное задание.';
  }
  return 'Не удалось подтвердить съёмочное задание. Идея сохранена, но неполный план нельзя использовать для съёмки.';
}

export default function PersonaShooting({ approvalProof, idea, brief, result, onBrief, onResult }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function build() {
    if (busy || !approvalProof) return;
    if (brief && validatePersonaShootingBrief(brief).length === 0) {
      setError('');
      setOpen(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await personaEdgeRequest({ action: 'shooting', idea, approvalProof });
      if (validatePersonaShootingBrief(response?.brief).length) {
        throw new Error('shooting_brief_quality_failed');
      }
      onBrief(response.brief as PersonaShootingBrief);
      setOpen(true);
    } catch (failure) {
      setError(shootingFailureMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  function complete() {
    if (!approvalProof || !brief || validatePersonaShootingBrief(brief).length) return;
    onResult({ completedAt: new Date().toISOString(), shotIds: brief.shots.map((shot) => shot.id) });
    setOpen(false);
  }

  return (
    <>
      <button className="primary" disabled={busy || !approvalProof} onClick={() => void build()}>
        {busy ? 'Готовлю съёмку…' : brief && validatePersonaShootingBrief(brief).length === 0
          ? 'Открыть съёмочное задание' : 'Сделать материал'}
      </button>
      {result && <div className="status">Съёмка сохранена · {result.shotIds.length} кадров.</div>}
      {brief && validatePersonaShootingBrief(brief).length === 0 &&
        <div className="status">Съёмочное задание проверено и сохранено.</div>}
      {error && <div className="status" role="alert">{error}</div>}
      {open && brief && validatePersonaShootingBrief(brief).length === 0 &&
        <ShootingBriefScreen brief={brief} onClose={() => setOpen(false)} onComplete={complete} />}
    </>
  );
}
