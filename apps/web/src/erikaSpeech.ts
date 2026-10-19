/**
 * Conservative preflight for natural-language mutations.
 * Never let an unrecognised instruction become a task title.
 */
export type SpeechRoute = 'copy-last-tomorrow' | 'plan' | 'existing' | 'clarify';

export function routeErikaSpeech(raw: string): SpeechRoute {
  const text = raw.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const refersToPrior = /(?:такую же|ту же|то же|так же|эту же|повтори предыдущее)/.test(text);
  if (refersToPrior) {
    if (/\bзавтра\b/.test(text) && /^(?:сделай|создай|добавь|повтори|скопируй|продублируй)\b/.test(text) &&
        !/(?:перенеси|удали|отмени|не делай)/.test(text)) return 'copy-last-tomorrow';
    return 'clarify';
  }
  // Relative or conversational dates need semantic resolution, not planner.ts title extraction.
  if (/\b(?:завтра|послезавтра|вчера|сегодня)\b/.test(text)) return 'clarify';
  if (/^(?:добавь|запланируй|запиши|поставь в план|мне нужно)\b/.test(text)) return 'plan';
  return 'existing';
}
