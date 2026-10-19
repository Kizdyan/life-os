import type { Item } from "./types";
import { move, outcome } from "./api";

export type ErikaResult = { understood: boolean; message: string };

type MoveIntent = { title: string; plannedStart: string };
type Resolution =
  | { state: "found"; item: Item }
  | { state: "ambiguous"; items: Item[] }
  | { state: "missing" };

function normalize(value: string) {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[.,!?;«»"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function score(text: string, title: string) {
  const input = new Set(normalize(text).split(" ").filter(word => word.length > 2));
  return normalize(title).split(" ").filter(word => word.length > 2)
    .reduce((total, word) => total + (input.has(word) ? 1 : 0), 0);
}

function inflectWord(word: string, form: "base" | "accusative" | "oblique" | "instrumental") {
  if (form === "base") return word;
  if (word.endsWith("ия")) {
    const stem = word.slice(0, -2);
    return form === "accusative" ? `${stem}ию` : form === "oblique" ? `${stem}ии` : `${stem}ией`;
  }
  if (word.endsWith("ая")) {
    const stem = word.slice(0, -2);
    return form === "accusative" ? `${stem}ую` : `${stem}ой`;
  }
  if (word.endsWith("яя")) {
    const stem = word.slice(0, -2);
    return form === "accusative" ? `${stem}юю` : `${stem}ей`;
  }
  if (word.endsWith("а")) {
    const stem = word.slice(0, -1);
    return form === "accusative" ? `${stem}у` : form === "oblique" ? `${stem}ы` : `${stem}ой`;
  }
  if (word.endsWith("я")) {
    const stem = word.slice(0, -1);
    return form === "accusative" ? `${stem}ю` : form === "oblique" ? `${stem}и` : `${stem}ей`;
  }
  return word;
}

/**
 * Conservative title forms, deliberately limited to full-title comparison.
 * Unknown morphology yields no match instead of a potentially wrong write.
 */
function titleForms(title: string) {
  const words = normalize(title).split(" ");
  return new Set((["base", "accusative", "oblique", "instrumental"] as const)
    .map(form => words.map(word => inflectWord(word, form)).join(" ")));
}

function resolveTask(title: string, items: Item[]): Resolution {
  const requested = normalize(title);
  const exact = items.filter(item => titleForms(item.title).has(requested));
  if (exact.length !== 1) {
    return exact.length > 1 ? { state: "ambiguous", items: exact } : { state: "missing" };
  }

  // A longer stored title that begins with the spoken full title blocks a write:
  // “репетицию” cannot choose between “Репетиция” and “Репетиция вокала”.
  const broader = items.filter(item =>
    item.id !== exact[0].id &&
    [...titleForms(item.title)].some(form => form.startsWith(`${requested} `)),
  );
  return broader.length ? { state: "ambiguous", items: [exact[0], ...broader] } : { state: "found", item: exact[0] };
}

function validLocalDate(date: string, time: string) {
  const parsed = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(date);
  const clock = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.test(time);
  if (!parsed || !clock) return false;
  const [year, month, day] = parsed.slice(1).map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function explicitMove(text: string): MoveIntent | "invalid-date" | null {
  const match = normalize(text).match(/(?:^|\s)(?:перенеси|перенести)\s+(.+?)\s+на\s+(\d{4}-\d{2}-\d{2})\s+в\s+(\d{2}:\d{2})(?:\s|$)/i);
  if (!match) return null;
  if (!validLocalDate(match[2], match[3])) return "invalid-date";
  return { title: match[1].trim(), plannedStart: `${match[2]}T${match[3]}:00+03:00` };
}

export async function executeErika(text: string, items: Item[]): Promise<ErikaResult> {
  const moveIntent = explicitMove(text);
  if (moveIntent === "invalid-date") {
    return { understood: false, message: "Дата или время переноса некорректны." };
  }
  if (moveIntent) {
    const resolution = resolveTask(moveIntent.title, items);
    if (resolution.state === "missing") return { understood: false, message: "Не нашла задачу для переноса." };
    if (resolution.state === "ambiguous") {
      return {
        understood: false,
        message: `Уточните, какую задачу перенести: ${resolution.items.map(item => item.title).join(" или ")}.`,
      };
    }
    await move(resolution.item.id, moveIntent.plannedStart);
    return {
      understood: true,
      message: `↗ ${resolution.item.title} — перенесено на ${moveIntent.plannedStart.slice(0, 10)} в ${moveIntent.plannedStart.slice(11, 16)}.`,
    };
  }

  const normalized = normalize(text);
  const ranked = items.map(item => ({ item, score: score(normalized, item.title) })).sort((a, b) => b.score - a.score);
  const item = ranked[0]?.score ? ranked[0].item : null;
  if (!item) return { understood: false, message: "Не нашла подходящий пункт в сегодняшнем графике." };
  if (/(?:сделал|сделано|выполнил|готово|завершил)/i.test(normalized)) {
    await outcome(item, "complete");
    return { understood: true, message: `✓ ${item.title} — выполнено.` };
  }
  if (/(?:не сделал|не выполнил|не успел|пропустил)/i.test(normalized)) {
    await outcome(item, "not_complete");
    return {
      understood: true,
      message: item.carry_forward
        ? `× ${item.title} — отмечено как не выполненное вовремя и перенесено дальше.`
        : `× ${item.title} — не выполнено.`,
    };
  }
  return { understood: false, message: "Пункт нашла, но не поняла действие." };
}
