import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { approvePersonaCandidate, validatePersonaShootingBrief } from "./quality-gates.ts";
import { buildDeterministicShootingBrief, isActionableApproval, pickApprovedBrain, sealApprovedIdea, verifyApproval } from "./persona-brain.ts";
import { budgetPolicy, reserveBudget } from "./persona-cost.ts";
import { runProviderRouter } from "./persona-provider.ts";
import { signFreeEditorialStarter } from "./persona-free-editorial.ts";
import { persistApprovedEntry, persistShootingBrief, readServerBrain, readServerBudget, reserveServerAiCall } from "./persona-store.ts";

const AUTH_UPSTREAM = "https://zhehdbhpkcucgcjwuhxm.supabase.co/functions/v1/life-os-runtime-prototype-v2";
const STATUS_UPSTREAM = "https://zhehdbhpkcucgcjwuhxm.supabase.co/functions/v1/life-os-runtime-prototype";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method === "GET") return proxy(request, AUTH_UPSTREAM);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (body.op !== "persona") {
    return proxyJson(body, AUTH_UPSTREAM);
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!(await authenticated(token))) return json({ error: "authentication_required" }, 401);

  const payload = body.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json({ error: "invalid_persona_payload" }, 400);
  }

  const action = String((payload as Record<string, unknown>).action ?? "");
  try {
    if (action === "recommend") return json(await recommend(payload as Record<string, unknown>));
    if (action === "shooting") return json({ brief: await shooting(payload as Record<string, unknown>) });
    if (action === "budget_status") return json(await budgetStatus());
    return json({ error: "unsupported_persona_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("persona prototype v3 failed", action, message);
    if (message === "idea_approval_required" || message === "approval_idea_mismatch") {
      return json({ error: "idea_approval_required", action }, 409);
    }
    if (message.startsWith("invalid_shooting_brief:")) {
      return json({ error: "shooting_brief_quality_failed", action }, 422);
    }
    if (message.startsWith("openai_failed:429")) {
      return json({ error: "ai_quota_unavailable", action }, 503);
    }
    return json({ error: "persona_runtime_failed", action }, 503);
  }
});

async function authenticated(token: string): Promise<boolean> {
  if (!token) return false;
  const response = await fetch(STATUS_UPSTREAM, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "status", token }),
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => ({})) as { authenticated?: unknown };
  return payload.authenticated === true;
}

const APPROVAL_SIGNING_SECRET = () => (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

function safeRecommendation(reason: string, mode: string = "ECONOMY"): Record<string, unknown> {
  return {
    ready: false, recommendation: null, alternatives: [], degraded: true,
    analysisSummary: "Новые идеи не подтверждены. История, банк идей и съёмка утверждённого материала доступны без AI.",
    intelligence: { mode, costMode: "FREE_ONLY", freshness: "unverified", reason, providerRequired: false },
  };
}
async function budgetStatus(): Promise<Record<string, unknown>> {
  const policy = budgetPolicy((key) => Deno.env.get(key), 0, true);
  try {
    const remote = await readServerBudget();
    const enabled = Deno.env.get("PERSONA_V3_PAID_AI_ENABLED") === "true";
    return { ...remote, mode: enabled && policy.mode === "AI" ? "AI_ON_REQUEST" : "ECONOMY",
      paidAiEnabled: enabled, policy, status: "AVAILABLE" };
  } catch {
    return { mode: "ECONOMY", policy, status: "BUDGET_STORE_UNAVAILABLE" };
  }
}

async function recommend(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // Provider-free path runs first. The server verifies the HMAC for any client snapshot.
  // Persisted cache survives Edge restarts and iPhone browser reloads.
  const signingSecret = APPROVAL_SIGNING_SECRET();
  let snapshot: Awaited<ReturnType<typeof readServerBrain>> | null = null;
  try { snapshot = await readServerBrain(); } catch (error) {
    console.warn("persona Shared Brain read unavailable", error instanceof Error ? error.message : "unknown");
  }
  const submitted = payload.brain && typeof payload.brain === "object"
    ? (payload.brain as Record<string, unknown>).entries : [];
  const combined = [
    ...(snapshot?.entries ?? []),
    ...(Array.isArray(submitted) ? submitted : []),
  ];
  const approved = await pickApprovedBrain(combined, signingSecret, payload.history);
  if (approved) {
    if (!isActionableApproval(approved)) {
      return safeRecommendation("stale_cache_non_actionable");
    }
    return {
      ready: true,
      recommendation: approved.idea,
      approvalProof: approved.approvalProof,
      approvedAt: approved.approvedAt,
      evidenceCheckedAt: approved.evidenceCheckedAt,
      alternatives: [],
      degraded: approved.freshness === "stale",
      analysisSummary: approved.freshness === "stale"
        ? "Утверждённую идею можно доснять. Рыночные данные устарели, новая аналитика не заявляется."
        : "Использована ранее утверждённая рекомендация из Shared Brain без платного AI.",
      intelligence: {
        mode: "CACHED", costMode: "FREE_ONLY", freshness: approved.freshness, providerRequired: false,
        origin: "server_signed_approval",
      },
    };
  }

  // Authenticated FREE_ONLY bootstrap is only allowed for a genuinely empty durable
  // Shared Brain. This is a fixed, editorially checked platform-format example,
  // NOT AI research or a claim of a current trend. It expires without renewal.
  // Existing stale/unverified entries are never silently promoted or replaced.
  if (combined.length === 0 && payload.allowPaidAi !== true) {
    try {
      const starter = await signFreeEditorialStarter(signingSecret, payload.history);
      if (starter) {
        await persistApprovedEntry(starter, {
          review: "editorial_free_only",
          provenance: "HUMAN_EDITORIAL_CURATED_2026-10-08",
          paidAiCalls: 0,
        });
        return {
          ready: true, recommendation: starter.idea, alternatives: [],
          approvalProof: starter.approvalProof,
          approvedAt: starter.approvedAt,
          evidenceCheckedAt: starter.evidenceCheckedAt,
          degraded: false,
          analysisSummary: "Бесплатная редакционно проверенная идея. Источники подтверждают формат, но не свежий тренд или прогноз охватов.",
          intelligence: {
            mode: "CACHED", costMode: "FREE_ONLY", freshness: "cached",
            providerRequired: false, origin: "server_signed_editorial_free_only",
          },
        };
      }
    } catch (error) {
      console.warn("persona free editorial bootstrap unavailable",
        error instanceof Error ? error.message : "unknown");
      // Durable storage failure must never create actionable browser-only approval.
    }
  }

  // Require BOTH operator permission and a fresh affirmative caller request.
  // Neither legacy clients nor page reloads may implicitly trigger paid research.
  if (payload.allowPaidAi !== true ||
      Deno.env.get("PERSONA_V3_PAID_AI_ENABLED") !== "true") {
    return safeRecommendation("paid_ai_explicitly_disabled");
  }

  const policy = budgetPolicy((key) => Deno.env.get(key),
    JSON.stringify(payload.context ?? {}).length + 3000, true);
  if (policy.mode === "ECONOMY") return safeRecommendation("budget_disabled_or_exhausted");

  try {
    // Single paid research+critique pass (instead of four calls for every visit).
    // web_search may be used only on a fresh cache miss and after atomic budget reservation.
    const response = await aiJson([
      "Ты Research Lead и самокритичный редактор Persona для российского short-form.",
      "Найди реальные свежие рыночные сигналы через web_search. Не выдумывай тренды.",
      "Сначала предложи 2–3 кандидата, проверь холодный hook, естественность для актёра/музыканта,",
      "выполнимость за 5–15 минут и длительность итогового видео 15–30 секунд.",
      "Новая идея может быть утверждена только при >=80/100 и подтверждённых источниках.",
      "Если источников нет, отвечай ready:false. Никаких неподтверждённых экспертных обещаний.",
      "Верни JSON: {ready:boolean,candidates:[{id,title,angle,format:'reel',score,confidence,",
      "reason,hook,script,soloPlan,helperPlan,estimatedMinutes,estimatedDurationSeconds,",
      "whyNow:[],marketEvidence:[{source,finding,url,asOf}],qualityVerdict:{verdict:'APPROVE|REVISE|REJECT',score,summary,risks:[]}}],",
      "criticJudge:{criticNotes:[],judgeSummary:string},analysisSummary:string}."
    ].join("\n"), {
      context: payload.context ?? {}, history: payload.history ?? [],
      priorIdeas: payload.priorIdeas ?? [],
    }, true) as Record<string, unknown>;

    const candidates = Array.isArray(response.candidates) ? response.candidates : [];
    for (const item of candidates.slice(0, 3)) {
      const checked = approvePersonaCandidate(item);
      if (!checked.approved || !checked.candidate) continue;
      try {
        const sealed = await sealApprovedIdea(checked.candidate, signingSecret);
        try { await persistApprovedEntry(sealed, response.criticJudge ?? checked.candidate.qualityVerdict); }
        catch (error) {
          // iPhone keeps the signed approval locally if the DB cache is temporarily down.
          console.warn("persona Shared Brain write unavailable", error instanceof Error ? error.message : "unknown");
        }
        return {
          ready: true, recommendation: sealed.idea, alternatives: [],
          approvalProof: sealed.approvalProof,
          approvedAt: sealed.approvedAt, evidenceCheckedAt: sealed.evidenceCheckedAt,
          degraded: false,
          analysisSummary: typeof response.analysisSummary === "string"
            ? response.analysisSummary : "AI-редакция и deterministic quality bar выполнены.",
          intelligence: { mode: "AI", costMode: "PAID_OPTIONAL", freshness: "fresh",
            providerRequired: true, criticType: "single_pass_self_critique" },
        };
      } catch (error) {
        console.warn("persona candidate cannot be signed", error instanceof Error ? error.message : "unknown");
      }
    }
    return safeRecommendation("no_idea_clears_quality_bar", "DETERMINISTIC");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const reason = message.includes("429") || message.includes("QUOTA") ? "provider_quota" :
      message.includes("budget") || message.includes("economy") || message.includes("ECONOMY") ? "budget_exhausted" :
      message.includes("TIMEOUT") || message.includes("abort") || message.includes("timeout") ? "provider_timeout" :
      message.includes("PERMISSION") ? "provider_permission" : "provider_unavailable";
    console.warn("persona recommend in safe mode", reason);
    return safeRecommendation(reason, "ECONOMY");
  }
}

async function shooting(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  // No paid model call. Only an unexpired, authentic approval from this server is actionable.
  const approved = await verifyApproval(payload.approvalProof, APPROVAL_SIGNING_SECRET());
  if (!isActionableApproval(approved)) throw new Error("idea_approval_required");
  const claimed = payload.idea && typeof payload.idea === "object"
    ? payload.idea as Record<string, unknown> : {};
  if (claimed.id !== approved.idea.id || claimed.title !== approved.idea.title) {
    throw new Error("approval_idea_mismatch");
  }
  let cached: Record<string, unknown> | null = null;
  try {
    const brain = await readServerBrain();
    const entry = brain.shootingBriefs.find(x => x.ideaId === approved.idea.id &&
      Date.parse(x.savedAt) >= Date.parse(approved.approvedAt));
    if (entry && validatePersonaShootingBrief(entry.brief).length === 0) cached = entry.brief;
  } catch { /* cache failure never blocks approved shooting */ }
  if (cached) return cached;
  const brief = buildDeterministicShootingBrief(approved.idea);
  try { await persistShootingBrief(String(approved.idea.id), brief); } catch {
    // The client also persists the returned brief in the local Shared Brain.
  }
  return brief;
}

let quotaCooldownUntil = 0;

async function aiJson(system: string, payload: unknown, web: boolean): Promise<unknown> {
  if (Date.now() < quotaCooldownUntil) throw new Error("openai_failed:429_cooldown");
  const key = (Deno.env.get("PERSONA_PROTOTYPE_OPENAI_API_KEY") ?? "").trim();
  if (!key) throw new Error("prototype_ai_credentials_missing");
  const configured = (Deno.env.get("PERSONA_V3_AI_PRIMARY_MODEL") ?? "gpt-4.1-mini").trim();
  const cheaper = (Deno.env.get("PERSONA_V3_AI_CHEAP_MODEL") ?? "gpt-4o-mini").trim();
  const models = [...new Set([configured, cheaper].filter(Boolean))];
  const output = await runProviderRouter<unknown>(
    models,
    async (isFallback) => {
      const model = isFallback ? models[1] : models[0];
      const input = JSON.stringify({ model, system, payload, web });
      const policy = budgetPolicy((name) => Deno.env.get(name), input.length, isFallback);
      const reservation = await reserveBudget(policy, reserveServerAiCall);
      return reservation.allowed;
    },
    async (model) => {
      const request = {
        model, store: false,
        input: [{ role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) }],
        ...(web ? { tools: [{ type: "web_search" }] } : {}),
      };
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return { status: response.status, value: await response.json() };
      const status = response.status;
      // Never print or store provider error text or API credentials.
      await response.body?.cancel().catch(() => undefined);
      console.warn("persona provider status", status, model);
      return { status };
    },
    () => { quotaCooldownUntil = Date.now() + 60 * 60 * 1000; },
  );
  return parseJson(extractText(output));
}

function describeCredential(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const first = trimmed[0] ?? "";
  const last = trimmed[trimmed.length - 1] ?? "";
  return {
    source: "PERSONA_PROTOTYPE_OPENAI_API_KEY",
    present: raw.length > 0,
    rawLength: raw.length,
    trimmedLength: trimmed.length,
    trimmedChanged: raw !== trimmed,
    wrappedInQuotes: (first === '"' && last === '"') || (first === "'" && last === "'"),
    containsAssignment: /^(?:PERSONA_PROTOTYPE_)?OPENAI_API_KEY\s*=/.test(trimmed),
    prefixFamily: trimmed.startsWith("sk-") ? "openai-sk" : "other",
  };
}

function extractText(raw: any): string {
  if (typeof raw?.output_text === "string" && raw.output_text.trim()) return raw.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(raw?.output) ? raw.output : []) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

function parseJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
  throw new Error("invalid_json_from_model");
}

async function proxyJson(body: Record<string, unknown>, upstreamUrl: string): Promise<Response> {
  const response = await fetch(upstreamUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return passthrough(response);
}

async function proxy(request: Request, upstreamUrl: string): Promise<Response> {
  const incoming = new URL(request.url);
  const upstream = new URL(upstreamUrl);
  upstream.search = incoming.search;
  const response = await fetch(upstream, { method: request.method });
  return passthrough(response);
}

function passthrough(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: CORS });
}
