import {
  formatLocalTimeOnDate,
  parseLocalTimeOnDate,
  parseLocalTimeOfDay,
} from "./planner";

export interface FlexibleTask {
  id: string;
  title: string;
  durationMin: number;
  priority: "mandatory" | "important" | "optional";
}

export interface BusyBlock {
  start: string;
  end: string;
}

export interface DayPlacement {
  taskId: string;
  start: string;
  end: string;
}

/** Plans calendar wall-clock time, not the host machine's timezone conversion. */
export function autoPlanDay(
  date: string,
  tasks: FlexibleTask[],
  busy: BusyBlock[],
  dayStart = "09:00",
  dayEnd = "23:00",
): DayPlacement[] {
  const sorted = [...tasks].sort((a, b) => rank(a.priority) - rank(b.priority));
  const occupied = busy
    .map((block) => ({
      start: parseLocalTimeOnDate(block.start, date),
      end: parseLocalTimeOnDate(block.end, date),
    }))
    .filter((block): block is { start: number; end: number } => block.start !== null && block.end !== null)
    .sort((a, b) => a.start - b.start);
  const out: DayPlacement[] = [];
  let cursor = parseLocalTimeOfDay(dayStart);
  const end = parseLocalTimeOfDay(dayEnd);

  for (const task of sorted) {
    let placed = false;
    while (!placed && cursor < end) {
      const conflict = occupied.find(
        (block) => block.start < cursor + task.durationMin && block.end > cursor,
      );
      if (conflict) {
        cursor = conflict.end;
        continue;
      }
      const taskEnd = cursor + task.durationMin;
      if (taskEnd > end) break;
      out.push({
        taskId: task.id,
        start: formatLocalTimeOnDate(date, cursor),
        end: formatLocalTimeOnDate(date, taskEnd),
      });
      occupied.push({ start: cursor, end: taskEnd });
      cursor = taskEnd;
      placed = true;
    }
  }
  return out;
}

function rank(priority: FlexibleTask["priority"]): number {
  return priority === "mandatory" ? 0 : priority === "important" ? 1 : 2;
}
