// Persona V3 budget reservation is atomic in the prototype-only Supabase table.
// No paid request proceeds when the budget service is unavailable or exhausted.
type Env = (name: string) => string | undefined;

export interface AiBudgetPolicy {
  mode: "ECONOMY" | "AI";
  callsPerDay: number;
  dailyUsd: number;
  monthlyUsd: number;
  reserveUsd: number;
  estInputTokens: number;
  estOutputTokens: number;
  reason?: string;
}

function numeric(env: Env, name: string, fallback: number, maximum: number): number {
  const value = Number(env(name) ?? fallback);
  return Number.isFinite(value) && value >= 0 && value <= maximum ? value : fallback;
}

export function budgetPolicy(
  env: Env, approximateInputChars: number, cheaper = false,
): AiBudgetPolicy {
  // At most one automatic research request per day by default.
  // This limit can be reduced to zero without redeploying the app.
  const callsPerDay = Math.floor(numeric(env, "PERSONA_V3_AI_CALLS_PER_DAY", 1, 50));
  const dailyUsd = numeric(env, "PERSONA_V3_AI_DAILY_USD", 0.03, 100);
  const monthlyUsd = numeric(env, "PERSONA_V3_AI_MONTHLY_USD", 0.30, 1000);
  const estInputTokens = Math.ceil(Math.min(Math.max(approximateInputChars, 0), 120_000) / 3.5);
  const estOutputTokens = cheaper ? 1200 : 2000;
  // Configurable price ceiling, not a claim of the provider's actual invoice.
  const inputPerMillion = numeric(env, "PERSONA_V3_INPUT_USD_PER_M", cheaper ? 0.50 : 2.00, 100);
  const outputPerMillion = numeric(env, "PERSONA_V3_OUTPUT_USD_PER_M", cheaper ? 2.00 : 8.00, 200);
  const reserveUsd = Math.ceil(Math.max(0.0001,
    (estInputTokens * inputPerMillion + estOutputTokens * outputPerMillion) / 1_000_000) * 1_000_000) / 1_000_000;
  if (!callsPerDay || dailyUsd < reserveUsd || monthlyUsd < reserveUsd) {
    return { mode: "ECONOMY", reason: "budget_config_exhausted", callsPerDay,
      dailyUsd, monthlyUsd, reserveUsd, estInputTokens, estOutputTokens };
  }
  return { mode: "AI", callsPerDay, dailyUsd, monthlyUsd,
    reserveUsd, estInputTokens, estOutputTokens };
}

export interface BudgetStoreResult {
  allowed: boolean;
  mode: string;
  reason?: string;
  dailyCalls?: number;
  dailyUsd?: number;
  monthlyUsd?: number;
}

export async function reserveBudget(
  policy: AiBudgetPolicy,
  reserve: (args: {
    day: string; month: string; policy: AiBudgetPolicy;
  }) => Promise<BudgetStoreResult>,
  now = Date.now(),
): Promise<BudgetStoreResult> {
  if (policy.mode === "ECONOMY") return { allowed: false, mode: "ECONOMY", reason: policy.reason };
  const iso = new Date(now).toISOString();
  try {
    const result = await reserve({ day: "day:" + iso.slice(0, 10),
      month: "month:" + iso.slice(0, 7), policy });
    return result.allowed && result.mode === "AI" ? result :
      { ...result, allowed: false, mode: "ECONOMY" };
  } catch {
    // DB outage must never become "unlimited free AI requests".
    return { allowed: false, mode: "ECONOMY", reason: "budget_store_unavailable" };
  }
}
