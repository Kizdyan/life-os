/**
 * Pure, offline-safe financial forecast. Monetary inputs are integer kopecks;
 * no bank connections, transfers or real expenses are created by this code.
 */
export type CashflowDirection = "income" | "expense";
export type CashflowRecurrence = "once" | "weekly" | "monthly";

export interface PlannedCashflow {
  id: string;
  title: string;
  firstDate: string; // ISO YYYY-MM-DD
  direction: CashflowDirection;
  amountKopecks: number;
  recurrence: CashflowRecurrence;
  mandatory: boolean;
  endDate?: string | null;
}

export interface CashflowForecastInput {
  startingBalanceKopecks: number;
  fromDate: string;
  throughDate: string;
  entries: readonly PlannedCashflow[];
}

export interface ProjectedCashflow {
  occurrenceId: string;
  sourceId: string;
  date: string;
  title: string;
  direction: CashflowDirection;
  amountKopecks: number;
  mandatory: boolean;
  balanceAfterKopecks: number;
}

export interface CashflowForecast {
  startingBalanceKopecks: number;
  endingBalanceKopecks: number;
  lowestBalanceKopecks: number;
  totalIncomeKopecks: number;
  totalExpenseKopecks: number;
  firstShortfallDate: string | null;
  occurrences: ProjectedCashflow[];
  /** Forecast only. Never represents actual bank balances. */
  simulationOnly: true;
}

const DAY_MS = 86_400_000;
function dateMs(s: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Bad ISO date: ${s}`);
  const t = Date.parse(`${s}T00:00:00.000Z`);
  if (!Number.isFinite(t) || new Date(t).toISOString().slice(0, 10) !== s)
    throw new Error(`Impossible date: ${s}`);
  return t;
}
function iso(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }
function daysInMonth(y: number, m: number): number { return new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); }
function monthlyDate(firstMs: number, offset: number): number {
  const dt = new Date(firstMs);
  const startMonth = dt.getUTCFullYear() * 12 + dt.getUTCMonth() + offset;
  const y = Math.floor(startMonth / 12), m = startMonth % 12;
  const day = Math.min(dt.getUTCDate(), daysInMonth(y, m));
  return Date.UTC(y, m, day);
}
function validMoney(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000_000;
}

export function forecastCashflow(input: CashflowForecastInput): CashflowForecast {
  const start = dateMs(input.fromDate), end = dateMs(input.throughDate);
  if (end < start || end - start > 366 * DAY_MS)
    throw new Error("Forecast date range must be nonempty and at most 366 days");
  if (!Number.isSafeInteger(input.startingBalanceKopecks) ||
      Math.abs(input.startingBalanceKopecks) > 1_000_000_000_000)
    throw new Error("Invalid opening balance");
  const knownIds = new Set<string>();
  const events: Array<Omit<ProjectedCashflow, "balanceAfterKopecks"> & { _ms: number }> = [];
  for (const entry of input.entries) {
    if (!entry.id.trim() || knownIds.has(entry.id)) throw new Error("Unique nonempty entry IDs required");
    knownIds.add(entry.id);
    if (!validMoney(entry.amountKopecks) || entry.amountKopecks === 0)
      throw new Error(`Invalid amount for ${entry.id}`);
    if (!['income', 'expense'].includes(entry.direction) ||
        !['once', 'weekly', 'monthly'].includes(entry.recurrence))
      throw new Error(`Invalid cashflow category for ${entry.id}`);
    const first = dateMs(entry.firstDate);
    const last = entry.endDate ? dateMs(entry.endDate) : end;
    if (last < first) throw new Error(`End date before first date: ${entry.id}`);
    for (let n = 0; n <= 370; n++) {
      const ms = entry.recurrence === "monthly" ? monthlyDate(first, n) :
        first + n * (entry.recurrence === "weekly" ? 7 * DAY_MS : 0);
      if (ms > end || ms > last) break;
      if (ms >= start) events.push({
        occurrenceId: `${entry.id}@${iso(ms)}`, sourceId: entry.id,
        date: iso(ms), title: entry.title, direction: entry.direction,
        amountKopecks: entry.amountKopecks, mandatory: entry.mandatory, _ms: ms,
      });
      if (entry.recurrence === "once") break;
    }
  }
  // Conservative same-day ordering: payments first, then receipts.
  events.sort((a, b) => a._ms - b._ms ||
    (a.direction === "expense" ? 0 : 1) - (b.direction === "expense" ? 0 : 1) ||
    a.sourceId.localeCompare(b.sourceId));
  let balance = input.startingBalanceKopecks;
  let lowest = balance, firstShortfall: string | null = balance < 0 ? input.fromDate : null;
  let income = 0, expense = 0;
  const occurrences: ProjectedCashflow[] = events.map(({ _ms, ...event }) => {
    if (event.direction === "income") { balance += event.amountKopecks; income += event.amountKopecks; }
    else { balance -= event.amountKopecks; expense += event.amountKopecks; }
    if (!Number.isSafeInteger(balance)) throw new Error("Forecast arithmetic exceeds safe precision");
    lowest = Math.min(lowest, balance);
    if (balance < 0 && firstShortfall === null) firstShortfall = event.date;
    return { ...event, balanceAfterKopecks: balance };
  });
  return {
    startingBalanceKopecks: input.startingBalanceKopecks,
    endingBalanceKopecks: balance, lowestBalanceKopecks: lowest,
    totalIncomeKopecks: income, totalExpenseKopecks: expense,
    firstShortfallDate: firstShortfall, occurrences, simulationOnly: true,
  };
}
