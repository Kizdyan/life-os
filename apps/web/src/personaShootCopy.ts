// Camera setup lives only in its dedicated field, not in "Что делать".
export function shootActionOnly(plan: string, numberOfTakes: number, seconds: number): string {
  const takes = Number.isFinite(numberOfTakes) ? Math.max(1, Math.trunc(numberOfTakes)) : 2;
  const duration = Number.isFinite(seconds) ? Math.max(1, Math.trunc(seconds)) : 25;
  const withoutSetup = plan
    .replace(/(?:^|\s)(?:Поставь|Установи|Расположи|Закрепи)\s+(?:iPhone|телефон|камеру)[^.!?]*[.!?]?\s*/giu, ' ')
    .trim();
  const withoutDuplicateTake = withoutSetup.replace(
    /^(?:Сними|Снять)\s+(?:один|1)\s+[^,.;]*?дубль(?:\s+[^,.;]*)?(?:,\s*|\.\s*|$)/iu,
    '',
  );
  const instruction = withoutDuplicateTake
    .replace(/^меняя(?=\s|$)/iu, 'Меняй')
    .replace(/^сыграть(?=\s|$)/iu, 'Сыграй')
    .replace(/^снять(?=\s|$)/iu, 'Сними')
    .replace(/(^|[,;]\s*)снять(?=\s)/giu, '$1сними')
    .trim()
    .replace(/[.!?\s]+$/u, '');
  const context = instruction ? " " + instruction[0].toUpperCase() + instruction.slice(1) + "." : "";
  const noun = takes === 1 ? 'дубль' : takes < 5 ? 'дубля' : 'дублей';
  return "Сними " + takes + " " + noun + " по " + duration + " секунд." + context;
}
