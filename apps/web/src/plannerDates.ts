// Pure date/capture helpers shared by iPhone planning and the Calendar view.
// Wall-clock local times intentionally stay unzoned; avoid toISOString() on local
// Date objects or iPhone timezones may silently move appointments by a day.
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const noonUtc = Date.UTC(year, month - 1, day, 12);
  return new Date(noonUtc + days * 86_400_000).toISOString().slice(0, 10);
}

export function localToday(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const iso = (day: string, clock: string): string | null =>
  clock ? `${day}T${clock}:00` : null;

export function parseCapture(input: string, date: string) {
  const tomorrow = /завтра/i.test(input);
  const match = input.match(/(?:в|на)\s*(\d{1,2})[:.](\d{2})/i);
  const validTime = match && Number(match[1]) >= 0 && Number(match[1]) < 24 &&
    Number(match[2]) >= 0 && Number(match[2]) < 60;
  const durationMatch = input.match(/(\d+)\s*(?:мин|минут)/i);
  const duration = durationMatch ? Number(durationMatch[1]) : 30;
  const safeDuration = Number.isFinite(duration) && duration > 0 && duration <= 1440
    ? duration : 30;
  const title = input.replace(/(сегодня|завтра)/ig, '')
    .replace(/(?:в|на)\s*\d{1,2}[:.]\d{2}/ig, '')
    .replace(/на\s+\d+\s*(?:минут\w*|мин)/ig, '')
    .replace(/\s+/g, ' ').trim();
  const scheduledDay = tomorrow ? addDays(date, 1) : date;
  if (!validTime || !match) return { title, date: scheduledDay, start: null, end: null };
  const hour = Number(match[1]), minute = Number(match[2]);
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + safeDuration;
  const endDay = addDays(scheduledDay, Math.floor(endMinutes / 1440));
  const clock = (total: number) => {
    const minutes = total % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };
  return {
    title, date: scheduledDay,
    start: iso(scheduledDay, clock(startMinutes)),
    end: iso(endDay, clock(endMinutes)),
  };
}

export function captureDraft(input: string, date: string, inbox = false) {
  const captured = parseCapture(input, date);
  return {
    title: captured.title,
    planned_start: inbox ? null : captured.start,
    planned_end: inbox ? null : captured.end,
  };
}
