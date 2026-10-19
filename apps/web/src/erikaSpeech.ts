/**
 * Conservative preflight for natural-language mutations.
 * Never let an unrecognised instruction become a task title.
 */
export type SpeechRoute = 'copy-last-tomorrow' | 'plan' | 'existing' | 'clarify';

export function routeErikaSpeech(raw: string): SpeechRoute {
  const text = raw.trim().toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ');
  const refersToPrior = /(?:такую же|ту же|то же|так же|эту же|повтори предыдущее)/.test(text);
  if (refersToPrior) {
    if (/(?:^|\s)завтра(?:\s|$)/.test(text) && /^(?:сделай|создай|добавь|повтори|скопируй|продублируй)(?:\s|$)/.test(text) &&
        !/(?:перенеси|удали|отмени|не делай)/.test(text)) return 'copy-last-tomorrow';
    return 'clarify';
  }
  // Relative or conversational dates need semantic resolution, not planner.ts title extraction.
  if (/\b(?:завтра|послезавтра|вчера|сегодня)(?:\s|$)/.test(text)) return 'clarify';
  if (/^(?:добавь|запланируй|запиши|поставь в план|мне нужно)(?:\s|$)/.test(text)) return 'plan';
  return 'existing';
}
