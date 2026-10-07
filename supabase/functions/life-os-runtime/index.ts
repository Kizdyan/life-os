import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OWNER_ID = 'b48182e1-0802-4741-89a1-bba6341cb8c8';
const OWNER_PASSCODE_SHA256 = '7b9f92d5fff6262ad5ccecfd3c5e7e3eb2cf7cdc4af06804d27f90bf3defcafb';
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type RuntimeEnv = { url: string; serviceKey: string };
type Session = { userId: string; issuedAt: number; expiresAt: number };
type MutationInput = {
  mutationId: string;
  recordId: string;
  kind: 'life_item' | 'life_outcome' | 'memory' | 'audit' | 'project' | 'goal' | 'setting';
  expectedVersion: number | null;
  payload: Record<string, unknown>;
  deleted: boolean;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method === 'GET') {
    const url = new URL(request.url);
    return url.searchParams.get('health') === '1'
      ? health()
      : json({ error: 'method_not_allowed' }, 405, { Allow: 'POST, GET, OPTIONS' });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, { Allow: 'POST, GET, OPTIONS' });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  switch (body.op) {
    case 'login': return login(body.passcode);
    case 'status': return status(body.token);
    case 'health': return health();
    case 'sync': return sync(body.token, body.mutations, body.sinceRevision);
    case 'persona': return persona(body.token, body.payload);
    default: return json({ error: 'unsupported_operation' }, 400);
  }
});

async function login(rawPasscode: unknown): Promise<Response> {
  if (typeof rawPasscode !== 'string' || !rawPasscode.trim()) return json({ error: 'passcode_required' }, 400);
  const actual = await sha256Hex(rawPasscode.trim());
  if (!constantTimeEqual(actual, OWNER_PASSCODE_SHA256)) return json({ error: 'invalid_credentials' }, 401);
  const now = Date.now();
  const token = await seal({ userId: OWNER_ID, issuedAt: now, expiresAt: now + SESSION_MAX_AGE_MS });
  return json({ authenticated: true, token });
}

async function status(rawToken: unknown): Promise<Response> {
  return json({ authenticated: Boolean(await verifySession(rawToken)) });
}

async function health(): Promise<Response> {
  const runtime = runtimeEnv();
  if (!runtime) return json({ configured: false, databaseReachable: false, storeRevision: null }, 503);
  try {
    const revision = await readRevision(runtime);
    return json({ configured: true, databaseReachable: true, storeRevision: revision });
  } catch {
    return json({ configured: true, databaseReachable: false, storeRevision: null }, 502);
  }
}

async function sync(rawToken: unknown, rawMutations: unknown, rawSinceRevision: unknown): Promise<Response> {
  const session = await verifySession(rawToken);
  if (!session) return json({ error: 'authentication_required' }, 401);
  const runtime = runtimeEnv();
  if (!runtime) return json({ error: 'runtime_not_configured' }, 503);
  if (!Array.isArray(rawMutations) || rawMutations.length > 100) return json({ error: 'invalid_mutations' }, 400);
  const sinceRevision = normalizeRevision(rawSinceRevision);
  if (sinceRevision === null) return json({ error: 'invalid_since_revision' }, 400);

  const mutations: MutationInput[] = [];
  for (const raw of rawMutations) {
    const parsed = parseMutation(raw);
    if (!parsed) return json({ error: 'invalid_mutation' }, 400);
    mutations.push(parsed);
  }

  try {
    const results = [];
    for (const mutation of mutations) results.push(await applyMutation(runtime, session.userId, mutation));
    const [records, storeRevision] = await Promise.all([
      listSince(runtime, session.userId, sinceRevision),
      readRevision(runtime, session.userId),
    ]);
    return json({ storeRevision, results, records });
  } catch (error) {
    console.error('edge runtime sync failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'runtime_sync_failed' }, 502);
  }
}

function runtimeEnv(): RuntimeEnv | null {
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const serviceKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  return url && serviceKey ? { url, serviceKey } : null;
}

async function applyMutation(runtime: RuntimeEnv, userId: string, mutation: MutationInput): Promise<unknown> {
  const response = await fetch(`${runtime.url}/rest/v1/rpc/life_runtime_apply_mutation_server`, {
    method: 'POST',
    headers: serviceHeaders(runtime.serviceKey),
    body: JSON.stringify({
      p_user_id: userId,
      p_mutation_id: mutation.mutationId,
      p_record_id: mutation.recordId,
      p_kind: mutation.kind,
      p_expected_version: mutation.expectedVersion,
      p_payload: mutation.payload,
      p_deleted: mutation.deleted,
    }),
  });
  if (!response.ok) throw new Error(`mutation:${response.status}`);
  return response.json();
}

async function listSince(runtime: RuntimeEnv, userId: string, sinceRevision: number): Promise<unknown[]> {
  const url = new URL(`${runtime.url}/rest/v1/life_runtime_records`);
  url.searchParams.set('select', 'record_id,user_id,kind,version,payload,deleted,updated_at,server_revision');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('server_revision', `gt.${Math.max(0, Math.floor(sinceRevision))}`);
  url.searchParams.set('order', 'server_revision.asc');
  const response = await fetch(url, { headers: serviceHeaders(runtime.serviceKey) });
  if (!response.ok) throw new Error(`snapshot:${response.status}`);
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.record_id),
    userId: String(row.user_id),
    kind: row.kind,
    version: Number(row.version),
    payload: row.payload ?? {},
    deleted: Boolean(row.deleted),
    updatedAt: String(row.updated_at),
  }));
}

async function readRevision(runtime: RuntimeEnv, userId = OWNER_ID): Promise<number> {
  const url = new URL(`${runtime.url}/rest/v1/life_runtime_state`);
  url.searchParams.set('select', 'store_revision');
  url.searchParams.set('user_id', `eq.${userId}`);
  url.searchParams.set('limit', '1');
  const response = await fetch(url, { headers: serviceHeaders(runtime.serviceKey) });
  if (!response.ok) throw new Error(`revision:${response.status}`);
  const rows = await response.json() as Array<{ store_revision?: number }>;
  return Number(rows[0]?.store_revision ?? 0);
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };
}

function parseMutation(value: unknown): MutationInput | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  const kinds = new Set(['life_item', 'life_outcome', 'memory', 'audit', 'project', 'goal', 'setting']);
  if (typeof input.mutationId !== 'string' || !input.mutationId.trim()) return null;
  if (typeof input.recordId !== 'string' || !input.recordId.trim()) return null;
  if (typeof input.kind !== 'string' || !kinds.has(input.kind)) return null;
  if (input.expectedVersion !== null && (typeof input.expectedVersion !== 'number' || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)) return null;
  if (!input.payload || typeof input.payload !== 'object' || Array.isArray(input.payload)) return null;
  if (typeof input.deleted !== 'boolean') return null;
  return {
    mutationId: input.mutationId,
    recordId: input.recordId,
    kind: input.kind as MutationInput['kind'],
    expectedVersion: input.expectedVersion as number | null,
    payload: input.payload as Record<string, unknown>,
    deleted: input.deleted,
  };
}

function normalizeRevision(value: unknown): number | null {
  if (value === undefined) return 0;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

async function verifySession(rawToken: unknown): Promise<Session | null> {
  if (typeof rawToken !== 'string' || !rawToken) return null;
  try {
    const session = await unseal<Session>(rawToken);
    if (session.userId !== OWNER_ID) return null;
    if (!Number.isFinite(session.issuedAt) || !Number.isFinite(session.expiresAt)) return null;
    if (session.issuedAt <= 0 || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

async function seal(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await sessionKey();
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(value)));
  return `${base64Url(iv)}.${base64Url(new Uint8Array(cipher))}`;
}

async function unseal<T>(token: string): Promise<T> {
  const [ivPart, cipherPart] = token.split('.');
  if (!ivPart || !cipherPart) throw new Error('invalid token');
  const key = await sessionKey();
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64Url(ivPart) }, key, fromBase64Url(cipherPart));
  return JSON.parse(decoder.decode(plain)) as T;
}

async function sessionKey(): Promise<CryptoKey> {
  const runtime = runtimeEnv();
  if (!runtime) throw new Error('runtime not configured');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`life-os-edge-session-v1:${runtime.serviceKey}`));
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized + padding);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

async function persona(rawToken: unknown, rawPayload: unknown): Promise<Response> {
  const session = await verifySession(rawToken);
  if (!session) return json({ error: 'authentication_required' }, 401);
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return json({ error: 'invalid_persona_payload' }, 400);
  const payload = rawPayload as Record<string, unknown>;
  const action = String(payload.action ?? 'plan');
  if (!['recommend', 'plan', 'shooting', 'generate', 'revise', 'prepublish'].includes(action)) return json({ error: 'unknown_persona_action' }, 400);
  if (action === 'recommend') {
    try {
      return json(await personaRecommend(payload));
    } catch (error) {
      console.error('persona recommend failed', error instanceof Error ? error.message : 'unknown');
      const fallback = localPersonaIdeas(Array.isArray(payload.history) ? payload.history : []).slice(0, 2).map((idea, index) => ({
        ...idea,
        score: 62 - index,
        confidence: 42,
        estimatedMinutes: 8,
        whyNow: ['Свежая рыночная аналитика временно недоступна'],
        soloPlan: 'Один разговорный дубль + два коротких B-roll.',
        qualityVerdict: {
          verdict: 'REVISE',
          score: 55,
          summary: 'Резервная идея без достаточного внешнего evidence. Не выдавать за высокоуверенную рекомендацию.',
          risks: ['Нет подтверждённого свежего market evidence'],
        },
      }));
      return json({
        recommendation: fallback[0] ?? null,
        alternatives: fallback.slice(1, 2),
        analysisSummary: 'Свежая аналитика недоступна: confidence автоматически снижен, ложный green-check запрещён.',
        degraded: true,
      });
    }
  }
  if (action === 'plan') {
    try {
      const result = await personaAI('Ты контент-стратег актёра, музыканта и автора. Дай 16–24 разные идеи без повторов истории. Верни только JSON {"ideas":[{"id","title","angle","format","score","reason"}]}.', payload);
      if (Array.isArray((result as any)?.ideas) && (result as any).ideas.length >= 10) return json({ ideas: (result as any).ideas.slice(0, 24) });
    } catch (error) {
      console.error('persona plan AI failed', error instanceof Error ? error.message : 'unknown');
    }
    return json({ ideas: localPersonaIdeas(Array.isArray(payload.history) ? payload.history : []) });
  }
  try {
    if (action === 'shooting') {
      const idea = payload.idea as Record<string, unknown> | undefined;
      if (!idea || typeof idea.title !== 'string' || !idea.title.trim()) return json({ error: 'Сначала выбери идею' }, 400);
      const brief = await personaAI([
        'Ты режиссёр съёмки Persona. Задание должно позволять одному человеку открыть его на iPhone и снять материал без дополнительных вопросов.',
        'Сохраняй утверждённый hook/script идеи и не превращай короткий ролик в длинную постановку.',
        'Если helperPlan недоступен, автоматически строй полноценный solo-вариант. Минимизируй число смен кадров: один master + 1–3 B-roll, если этого достаточно для удержания.',
        'Для каждого кадра укажи id,purpose,shotSize,angle,cameraPosition,cameraHeight,distance,composition,movement,durationSeconds,takes,action,dialogue,bRoll,bRollInstruction.',
        'Отдельно укажи title,orientation,resolution,fps,audio,lighting,background,references.',
        'Для Reels/Shorts/VK Clips по умолчанию vertical, 4k, 30fps. Не выдумывай доступную локацию, реквизит или людей.',
        'Верни только JSON PersonaShootingBrief.'
      ].join('\n'), { idea });
      const issues = validateEdgeShootingBrief(brief);
      return issues.length ? json({ error: 'Не удалось собрать полное съёмочное задание', issues }, 502) : json({ brief });
    }
    if (action === 'generate') {
      const result = await personaAI('Ты автономная редакционная команда актёра, музыканта и автора. Не выдумывай биографические факты. Верни только JSON Draft: title, slides[{eyebrow,title,body}], caption, platformNotes{instagram,vk,youtube}, style, learnedRules, changeSummary.', payload);
      return json(result);
    }
    if (action === 'revise') {
      const result = await personaAI('Ты ведущий редактор Persona. Примени пользовательскую правку семантически, не выдумывай факты. Верни только JSON Draft: title, slides[{eyebrow,title,body}], caption, platformNotes{instagram,vk,youtube}, style, learnedRules, changeSummary.', payload);
      return json(result);
    }
    const qa = await personaAI('Ты независимый QA Persona. Проверь хук, удержание, логику, естественность, факты, iPhone-читаемость и платформенную адаптацию. Верни только JSON {"pass":boolean,"score":number,"issues":[{"target","instruction"}]}; pass только при score>=85.', payload);
    return json({ ready: Boolean((qa as any)?.pass) && Number((qa as any)?.score) >= 85, qa }, Boolean((qa as any)?.pass) && Number((qa as any)?.score) >= 85 ? 200 : 422);
  } catch (error) {
    console.error('persona AI failed', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'AI-редакция временно недоступна. Попробуй ещё раз позже.' }, 503);
  }
}

async function personaRecommend(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const research = await personaAIWithWeb([
    'Ты Research Lead Persona для российского рынка коротких вертикальных видео.',
    'Задача: выбрать не много идей, а 3 реально сильных кандидата, которые пользователь может снять СЕЙЧАС.',
    'Используй свежий web search по русскоязычному short-form рынку, прежде всего Россия/Москва, Instagram Reels, VK Clips и YouTube Shorts.',
    'Не выдавай общий мировой тренд за российский. Не выдумывай просмотры, тренды, источники или биографические факты.',
    'Пользователь — работающий актёр/музыкант/автор. Пока нельзя строить идею на неподтверждённой экспертности в мюзиклах. Предпочитай личное наблюдение из профессии, если оно сильнее.',
    'Учитывай прошлые rejected/later/used идеи и не повторяй отвергнутые концепции или манифесты типа «начинаю путь / посмотрим, куда приведёт».',
    'Учитывай реальный календарный контекст, доступное время и то, что человек может оказаться без оператора.',
    'Каждый кандидат должен быть выполним за 5–15 минут, иметь сильный hook первых 1–2 секунд, короткий script 15–30 секунд, soloPlan и helperPlan.',
    'В marketEvidence дай только реальные источники/наблюдения, которые ты действительно нашёл. Если evidence слабое — так и напиши и понизь confidence.',
    'Верни ТОЛЬКО JSON {"candidates":[{"id","title","angle","format","score","confidence","reason","hook","script","estimatedMinutes","whyNow":[],"resources":[],"soloPlan","helperPlan","marketEvidence":[{"source","finding","url","asOf"}]}],"evidenceSummary":"..."}'
  ].join('\n'), payload);

  const candidates = Array.isArray((research as any)?.candidates) ? (research as any).candidates.slice(0, 3) : [];
  if (candidates.length < 2) throw new Error('persona:insufficient_research_candidates');

  const frozenCase = {
    candidates,
    evidenceSummary: String((research as any)?.evidenceSummary ?? ''),
    context: payload.context ?? {},
    history: payload.history ?? [],
  };

  const [brandCritic, retentionCritic] = await Promise.all([
    personaAI([
      'Ты независимый Challenger/Personal Brand critic. Не соглашайся автоматически.',
      'Проверь каждый кандидат на органичность для этого конкретного автора, повторяемость прошлых неудачных концепций, фальшивую экспертность, пафос, банальность и несоответствие текущему этапу позиционирования.',
      'Верни только JSON {"reviews":[{"id","verdict":"APPROVE|REVISE|REJECT","score":0,"problems":[],"requiredChanges":[]}]}'
    ].join('\n'), frozenCase),
    personaAI([
      'Ты независимый Audience/Retention critic российского short-form. Не соглашайся автоматически.',
      'Проверь hook первых 1–2 секунд, понятность холодной аудитории, длину 15–30 секунд, визуальную реализуемость на улице/iPhone, потенциал удержания и отсутствие бессмысленной сложности.',
      'Не считай утверждение о тренде доказанным, если в evidence нет источника.',
      'Верни только JSON {"reviews":[{"id","verdict":"APPROVE|REVISE|REJECT","score":0,"problems":[],"requiredChanges":[]}]}'
    ].join('\n'), frozenCase),
  ]);

  const judged = await personaAI([
    'Ты Judge Persona. Получаешь замороженные кандидаты, market evidence и две независимые критики.',
    'Не голосуй простым большинством. Выбери максимум ОДНУ основную идею и максимум ОДНУ альтернативу.',
    'Если лучший кандидат можно существенно улучшить по замечаниям — исправь hook/script/angle сам до финального результата.',
    'Основная рекомендация допускается только если после исправления quality score >=80 и confidence обоснован evidence. Если evidence неполное, confidence должен быть ниже.',
    'Никаких обещаний «это 100% сработает». Confidence означает сравнительную уверенность, а не гарантию.',
    'Верни только JSON {"ready":boolean,"recommendation":{полный кандидат,"qualityVerdict":{"verdict":"APPROVE|REVISE|REJECT","score":0,"summary":"...","risks":[]}},"alternatives":[{полный кандидат,"qualityVerdict":{...}}],"analysisSummary":"коротко почему именно это"}'
  ].join('\n'), { ...frozenCase, brandCritic, retentionCritic });

  if ((judged as any)?.ready !== true || !(judged as any)?.recommendation) {
    throw new Error('persona:no_candidate_clears_quality_bar');
  }
  const recommendation = (judged as any).recommendation;
  if (Number(recommendation?.qualityVerdict?.score ?? 0) < 80) {
    throw new Error('persona:quality_bar_not_met');
  }
  return {
    recommendation,
    alternatives: Array.isArray((judged as any)?.alternatives) ? (judged as any).alternatives.slice(0, 1) : [],
    analysisSummary: String((judged as any)?.analysisSummary ?? 'Рекомендация прошла research + independent critique + Judge.'),
    degraded: false,
  };
}

function openAIModelCandidates(): string[] {
  const configured = (Deno.env.get('PERSONA_OPENAI_MODEL') ?? '').trim();
  return [...new Set([configured, 'gpt-5.6-terra'].filter(Boolean))];
}

function parseJSONText(text: string): unknown {
  const cleaned = text.trim().replace(/^\`\`\`(?:json)?/i, '').replace(/\`\`\`$/, '').trim();
  if (!cleaned) throw new Error('openai:empty');
  return JSON.parse(cleaned);
}

function extractResponsesText(raw: any): string {
  if (typeof raw?.output_text === 'string' && raw.output_text.trim()) return raw.output_text.trim();
  const parts: string[] = [];
  for (const item of Array.isArray(raw?.output) ? raw.output : []) {
    if (item?.type !== 'message' || !Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (content?.type === 'output_text' && typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function personaAIWithWeb(system: string, payload: unknown): Promise<unknown> {
  const key = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured in Supabase Edge');
  let lastStatus = 0;
  for (const model of openAIModelCandidates()) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        store: false,
        tools: [{ type: 'web_search' }],
        input: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
    });
    lastStatus = response.status;
    if (response.ok) {
      const raw = await response.json() as any;
      return parseJSONText(extractResponsesText(raw));
    }
    const body = await response.text().catch(() => '');
    console.error('persona web AI failed', model, response.status, body.slice(0, 300));
    if (![400, 404].includes(response.status)) break;
  }
  throw new Error(`openai:web:${lastStatus || 'failed'}`);
}

async function personaAI(system: string, payload: unknown): Promise<unknown> {
  const key = (Deno.env.get('OPENAI_API_KEY') ?? '').trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured in Supabase Edge');
  let lastStatus = 0;
  for (const model of openAIModelCandidates()) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
      }),
    });
    lastStatus = response.status;
    if (response.ok) {
      const raw = await response.json() as any;
      return parseJSONText(String(raw?.choices?.[0]?.message?.content ?? ''));
    }
    const body = await response.text().catch(() => '');
    console.error('persona AI failed', model, response.status, body.slice(0, 300));
    if (![400, 404].includes(response.status)) break;
  }
  throw new Error(`openai:${lastStatus || 'failed'}`);
}

function validateEdgeShootingBrief(value: unknown): string[] {
  const b = value as any, issues: string[] = [];
  if (!b || typeof b !== 'object') return ['brief'];
  for (const key of ['title','orientation','resolution','audio','lighting','background']) if (!String(b[key] ?? '').trim()) issues.push(key);
  if (!Number.isFinite(Number(b.fps))) issues.push('fps');
  if (!Array.isArray(b.shots) || !b.shots.length) return [...issues, 'shots'];
  for (let i=0;i<b.shots.length;i++) {
    const s=b.shots[i] ?? {};
    for (const key of ['id','purpose','shotSize','angle','cameraPosition','cameraHeight','distance','composition','movement','action']) if (!String(s[key] ?? '').trim()) issues.push(`shots[${i}].${key}`);
    if (!Number.isFinite(Number(s.durationSeconds)) || Number(s.durationSeconds) < 2) issues.push(`shots[${i}].durationSeconds`);
    if (!Number.isInteger(Number(s.takes)) || Number(s.takes) < 1) issues.push(`shots[${i}].takes`);
    if (s.bRoll === true && !String(s.bRollInstruction ?? '').trim()) issues.push(`shots[${i}].bRollInstruction`);
  }
  return issues;
}

function localPersonaIdeas(history: unknown[]): Array<Record<string, unknown>> {
  const blocked = new Set(history.map((x:any)=>String(x?.title ?? '').toLocaleLowerCase('ru-RU')));
  const seed = [
    ['Что зритель не видит за минуту до спектакля','Закулисье через один конкретный момент','reel'],
    ['Как четыре ноты превращаются в сцену','Музыкальное зерно → драматургия → оркестр','reel'],
    ['Как рождается аранжировка','От фортепиано до готового звучания','reel'],
    ['Один день между театром и музыкой','Соединить две профессии одной историей','reel'],
    ['Фрагмент будущего мюзикла','Тизер проекта без спойлеров','short'],
    ['Из заметки в готовую сцену','Показать реальный творческий процесс','reel'],
    ['Что происходит после «стоп, снято»','Момент, который обычно вырезают','reel'],
    ['Одна репетиция, которую стоило бы увидеть зрителю','Невидимая работа перед спектаклем','reel'],
    ['Как одна фраза меняет весь номер','Драматургия через микродеталь','reel'],
    ['Что остаётся после репетиции','Один честный кадр вместо отчёта','photo'],
    ['Как понять, что сцена уже живая','Признаки, которые замечает актёр','reel'],
    ['Почему процесс иногда интереснее результата','История через незавершённость','reel']
  ];
  return seed.filter(x=>!blocked.has(x[0].toLocaleLowerCase('ru-RU'))).map((x,i)=>({id:`edge-${i+1}`,title:x[0],angle:x[1],format:x[2],score:96-i,reason:'Баланс личного процесса, профессиональной глубины и интереса аудитории',status:'candidate'}));
}

function json(payload: unknown, status = 200, headersInit?: HeadersInit): Response {
  const headers = new Headers(headersInit);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  headers.set('Content-Type', 'application/json');
  headers.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(payload), { status, headers });
}
