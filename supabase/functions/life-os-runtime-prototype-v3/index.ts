import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    return json({ error: "unsupported_persona_action" }, 400);
  } catch (error) {
    console.error("persona prototype v3 failed", action, error instanceof Error ? error.message : String(error));
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

async function recommend(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const research = await aiJson(
    [
      "Ты Research Lead Persona для российского рынка коротких вертикальных видео.",
      "Используй web search и выбери 3 сильных кандидата, которые пользователь может снять сейчас.",
      "Не выдумывай тренды, просмотры, источники, биографию или доступные ресурсы.",
      "Не повторяй отвергнутые концепции и манифесты про начало пути.",
      "Пользователь — работающий актёр, музыкант и автор; не ставь его в неподтверждённую экспертную позицию.",
      "Каждый кандидат: 15–30 секунд итоговой длительности, 5–15 минут на съёмку, сильный hook первых 1–2 секунд, короткий script, soloPlan и helperPlan.",
      "marketEvidence содержит только реально найденные источники: source, finding, url, asOf.",
      "Верни только JSON: {candidates:[{id,title,angle,format,score,confidence,reason,hook,script,estimatedMinutes,estimatedDurationSeconds,whyNow:[],resources:[],soloPlan,helperPlan,marketEvidence:[{source,finding,url,asOf}]}],evidenceSummary:string}."
    ].join("\n"),
    payload,
    true,
  );

  const candidates = Array.isArray((research as any)?.candidates) ? (research as any).candidates.slice(0, 3) : [];
  if (candidates.length < 2) throw new Error("insufficient_research_candidates");

  const frozen = {
    candidates,
    evidenceSummary: String((research as any)?.evidenceSummary ?? ""),
    context: payload.context ?? {},
    history: payload.history ?? [],
    priorIdeas: payload.priorIdeas ?? [],
  };

  const [brand, retention] = await Promise.all([
    aiJson(
      [
        "Ты независимый Challenger по персональному бренду. Не соглашайся автоматически.",
        "Для каждого кандидата проверь органичность, банальность, повтор прошлых идей, фальшивую экспертность и соответствие текущему позиционированию.",
        "Верни только JSON {reviews:[{id,verdict:'APPROVE|REVISE|REJECT',score:number,problems:[],requiredChanges:[]}]}."
      ].join("\n"),
      frozen,
      false,
    ),
    aiJson(
      [
        "Ты независимый Audience/Retention critic российского short-form.",
        "Для каждого кандидата проверь hook первых 1–2 секунд, понятность холодной аудитории, реальную длительность 15–30 секунд, выполнимость за 5–15 минут и качество market evidence.",
        "Утверждение о тренде без source+url+asOf считать недоказанным.",
        "Верни только JSON {reviews:[{id,verdict:'APPROVE|REVISE|REJECT',score:number,problems:[],requiredChanges:[]}]}."
      ].join("\n"),
      frozen,
      false,
    ),
  ]);

  const judged = await aiJson(
    [
      "Ты Judge Persona. Получаешь замороженные кандидаты, evidence и две независимые критики.",
      "Выбери максимум одну основную рекомендацию и максимум одну альтернативу.",
      "Если замечания исправимы, сам исправь angle/hook/script до финального варианта.",
      "Основная рекомендация только если qualityVerdict.score >=80, estimatedMinutes 5–15, estimatedDurationSeconds 15–30 и confidence соответствует evidence.",
      "При отсутствии верифицируемого market evidence не выдавай рекомендацию как готовую.",
      "Верни только JSON {ready:boolean,recommendation:{полный кандидат,qualityVerdict:{verdict:'APPROVE|REVISE|REJECT',score:number,summary:string,risks:[]}},alternatives:[{полный кандидат,qualityVerdict:{verdict:'APPROVE|REVISE|REJECT',score:number,summary:string,risks:[]}}],analysisSummary:string}."
    ].join("\n"),
    { ...frozen, brandCritic: brand, retentionCritic: retention },
    false,
  );

  if ((judged as any)?.ready !== true || !(judged as any)?.recommendation) throw new Error("no_candidate_clears_quality_bar");
  const rec = (judged as any).recommendation;
  const score = Number(rec?.qualityVerdict?.score ?? 0);
  const shoot = Number(rec?.estimatedMinutes);
  const duration = Number(rec?.estimatedDurationSeconds);
  const evidence = Array.isArray(rec?.marketEvidence)
    ? rec.marketEvidence.filter((x: any) => x && String(x.source ?? "").trim() && String(x.url ?? "").trim() && String(x.asOf ?? "").trim() && String(x.finding ?? "").trim())
    : [];
  if (score < 80 || shoot < 5 || shoot > 15 || duration < 15 || duration > 30 || evidence.length === 0) {
    throw new Error("deterministic_quality_gate_failed");
  }

  return {
    recommendation: rec,
    alternatives: Array.isArray((judged as any)?.alternatives) ? (judged as any).alternatives.slice(0, 1) : [],
    analysisSummary: String((judged as any)?.analysisSummary ?? "Research + independent critique + Judge."),
    degraded: false,
  };
}

async function shooting(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const idea = payload.idea;
  if (!idea || typeof idea !== "object" || Array.isArray(idea) || !String((idea as any).title ?? "").trim()) {
    throw new Error("missing_idea");
  }
  const brief = await aiJson(
    [
      "Ты режиссёр съёмки Persona. Создай конкретное съёмочное задание для одного человека с iPhone.",
      "Сохраняй утверждённые hook и script идеи. Не придумывай локацию, реквизит или помощника.",
      "Для Reels/Shorts/VK Clips по умолчанию vertical, 4k, 30fps.",
      "Один master + 1–3 B-roll, если этого достаточно.",
      "Верни только JSON {title,orientation,resolution,fps,audio,lighting,background,references:[],shots:[{id,purpose,shotSize,angle,cameraPosition,cameraHeight,distance,composition,movement,durationSeconds,takes,action,dialogue,bRoll,bRollInstruction}]}."
    ].join("\n"),
    { idea },
    false,
  ) as Record<string, unknown>;

  const issues = validateBrief(brief);
  if (issues.length) throw new Error("invalid_shooting_brief:" + issues.join(","));
  return brief;
}

function validateBrief(value: Record<string, unknown>): string[] {
  const b = value as any;
  const issues: string[] = [];
  for (const key of ["title","orientation","resolution","audio","lighting","background"]) {
    if (!String(b?.[key] ?? "").trim()) issues.push(key);
  }
  if (!Number.isFinite(Number(b?.fps))) issues.push("fps");
  if (!Array.isArray(b?.shots) || b.shots.length === 0) return [...issues, "shots"];
  for (let i = 0; i < b.shots.length; i++) {
    const s = b.shots[i] ?? {};
    for (const key of ["id","purpose","shotSize","angle","cameraPosition","cameraHeight","distance","composition","movement","action"]) {
      if (!String(s[key] ?? "").trim()) issues.push(`shots[${i}].${key}`);
    }
    if (!Number.isFinite(Number(s.durationSeconds)) || Number(s.durationSeconds) < 2) issues.push(`shots[${i}].durationSeconds`);
    if (!Number.isInteger(Number(s.takes)) || Number(s.takes) < 1) issues.push(`shots[${i}].takes`);
    if (s.bRoll === true && !String(s.bRollInstruction ?? "").trim()) issues.push(`shots[${i}].bRollInstruction`);
  }
  return issues;
}

async function aiJson(system: string, payload: unknown, web: boolean): Promise<unknown> {
  const rawKey = Deno.env.get("PERSONA_PROTOTYPE_OPENAI_API_KEY") ?? "";
  const key = rawKey.trim();
  if (!key) throw new Error("PERSONA_PROTOTYPE_OPENAI_API_KEY_not_configured");
  const credentialShape = describeCredential(rawKey);
  const configured = (Deno.env.get("PERSONA_OPENAI_MODEL") ?? "").trim();
  const models = [...new Set([configured, "gpt-5.6-sol"].filter(Boolean))];
  let last = 0;

  for (const model of models) {
    const body: Record<string, unknown> = {
      model,
      store: false,
      input: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    };
    if (web) body.tools = [{ type: "web_search" }];

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    last = response.status;
    if (response.ok) {
      const raw = await response.json() as any;
      const text = extractText(raw);
      return parseJson(text);
    }
    const errorPayload = await response.json().catch(() => ({})) as {
      error?: { code?: unknown; type?: unknown; param?: unknown };
    };
    console.error("openai response failed", JSON.stringify({
      model,
      status: response.status,
      errorCode: String(errorPayload.error?.code ?? "unknown"),
      errorType: String(errorPayload.error?.type ?? "unknown"),
      errorParam: errorPayload.error?.param == null ? null : String(errorPayload.error.param),
      credentialShape,
      requestIdPresent: Boolean(response.headers.get("x-request-id")),
    }));
    if (![400, 404].includes(response.status)) break;
  }
  throw new Error("openai_failed:" + (last || "unknown"));
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
