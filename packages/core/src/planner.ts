import type { LifeItem } from "./life-item";

export interface PlannerSettings {
  theatreExitBufferMin: number;
  mealMin: number;
  travelDefaultMin: number;
  reserveMin: number;
}

export interface PlannedBlock {
  id: string;
  title: string;
  start: string;
  end: string;
  fixed: boolean;
  sourceId: string | null;
}

export function reserveTheatreExit(event: LifeItem, settings: PlannerSettings): PlannedBlock | null {
  if (!event.plannedStart || event.kind !== "event" || !/театр|спектак|репетиц/i.test(event.title)) return null;
  const start = new Date(event.plannedStart);
  const exit = new Date(start.getTime() - settings.theatreExitBufferMin * 60_000);
  return {
    id: `travel:${event.id}`,
    title: "Выйти в театр",
    start: exit.toISOString(),
    end: start.toISOString(),
    fixed: true,
    sourceId: event.id,
  };
}

/**
 * Finds a slot in the supplied calendar date's wall-clock time. Input offsets
 * are intentionally not converted: a block written as 10:00 occupies 10:00
 * in the planner regardless of the Node process timezone.
 */
export function findFreeSlot(
  blocks: PlannedBlock[],
  date: string,
  durationMin: number,
  dayStart = "09:00",
  dayEnd = "23:00",
): string | null {
  const start = parseLocalTimeOfDay(dayStart);
  const end = parseLocalTimeOfDay(dayEnd);
  const sorted = blocks
    .map((block) => ({
      start: parseLocalTimeOnDate(block.start, date),
      end: parseLocalTimeOnDate(block.end, date),
    }))
    .filter((block): block is { start: number; end: number } => block.start !== null && block.end !== null)
    .sort((a, b) => a.start - b.start);
  let cursor = start;
  for (const block of sorted) {
    if (block.end <= cursor) continue;
    if (block.start - cursor >= durationMin) return formatLocalTimeOnDate(date, cursor);
    if (block.end > cursor) cursor = block.end;
  }
  return end - cursor >= durationMin ? formatLocalTimeOnDate(date, cursor) : null;
}

export function parseLocalTimeOnDate(value: string, date: string): number | null {
  const match = new RegExp(`^${escapeRegex(date)}T(\\d{2}):(\\d{2})(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:?\\d{2})?$`).exec(value);
  if (!match) return null;
  return toMinutes(Number(match[1]), Number(match[2]));
}

export function parseLocalTimeOfDay(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid local time: ${value}`);
  return toMinutes(Number(match[1]), Number(match[2]));
}

export function formatLocalTimeOnDate(date: string, minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  if (hour < 0 || hour > 23 || minute < 0) throw new Error(`Invalid local minutes: ${minutes}`);
  return `${date}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;
}

function toMinutes(hour: number, minute: number): number {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("Invalid local time");
  }
  return hour * 60 + minute;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
