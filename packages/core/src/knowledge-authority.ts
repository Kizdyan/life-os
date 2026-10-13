export type KnowledgeKind = "fact" | "preference" | "constraint" | "goal" | "decision" | "hypothesis" | "reference" | "observation" | "derived_insight";
export type KnowledgeEpistemic = "user-stated" | "observed" | "inferred" | "external-unverified" | "externally-verified" | "derived";
export type KnowledgeStatus = "active" | "uncertain" | "superseded" | "rejected" | "erased";
export type KnowledgeSensitivity = "normal" | "private" | "sensitive";
export type PersonaExposure = "allowed" | "blocked" | "explicit-only";

export interface KnowledgeSource {
  sourceId: string;
  sourceSystem: string;
  available: boolean;
  capturedAt: string;
}

export interface KnowledgeInput {
  importId: string;
  domain: string;
  key: string;
  kind: KnowledgeKind;
  epistemic: KnowledgeEpistemic;
  value: unknown;
  recordedAt: string;
  validFrom: string;
  sensitivity: KnowledgeSensitivity;
  personaExposure: PersonaExposure;
  sources: KnowledgeSource[];
  derivedFrom?: string[];
}

export interface KnowledgeRecord extends KnowledgeInput {
  recordId: string;
  tenantId: string;
  ownerUserId: string;
  status: KnowledgeStatus;
  validTo?: string;
  supersedes: string[];
  supersededBy: string[];
  contradicts: string[];
  derivedFrom: string[];
}

interface KnowledgeAction {
  actionId: string;
  tenantId: string;
  ownerUserId: string;
  before: KnowledgeRecord[];
  affectedRecordIds: string[];
  undoneAt?: string;
  at: string;
  type: "correction" | "erasure" | "undo";
}

export interface KnowledgeState {
  schemaVersion: 1;
  revision: number;
  records: KnowledgeRecord[];
  imports: Record<string, string>;
  actions: KnowledgeAction[];
}

export interface KnowledgeStateStore {
  read(): Promise<KnowledgeState>;
  compareAndSwap(expectedRevision: number, next: KnowledgeState): Promise<boolean>;
}

export interface KnowledgePrincipal {
  readonly verified: true;
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
  readonly agent: string;
  readonly purpose: string;
}

const verifiedPrincipals = new WeakMap<object, SupabaseKnowledgeAuthenticator>();

function issueVerifiedKnowledgePrincipal(input: KnowledgePrincipal, issuer: SupabaseKnowledgeAuthenticator): KnowledgePrincipal {
  if (input.verified !== true || !input.userId || !input.tenantId) throw new Error("verified principal required");
  const principal = Object.freeze({ ...input, roles: Object.freeze([...input.roles]) });
  verifiedPrincipals.set(principal, issuer);
  return principal;
}

export class SupabaseKnowledgeAuthenticator {
  constructor(private readonly options: { supabaseUrl: string; publishableKey: string; allowedScopes: readonly { agent: string; purpose: string }[]; fetchImpl?: typeof fetch }) {}

  async authenticate(input: { accessToken: string; agent: string; purpose: string }): Promise<KnowledgePrincipal> {
    if (!input.accessToken.trim()) throw new Error("access token required");
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(new URL("/auth/v1/user", this.options.supabaseUrl), {
      method: "GET",
      headers: { apikey: this.options.publishableKey, Authorization: `Bearer ${input.accessToken}` },
    });
    if (!response.ok) throw new Error("authentication failed");
    const verified = await response.json() as { id?: unknown };
    const userId = typeof verified.id === "string" ? verified.id : "";
    if (!userId) throw new Error("authenticated identity incomplete");
    if (!this.options.allowedScopes.some((scope) => scope.agent === input.agent && scope.purpose === input.purpose)) throw new Error("knowledge scope denied");
    return issueVerifiedKnowledgePrincipal({ verified: true, userId, tenantId: userId, roles: ["authenticated"], agent: input.agent, purpose: input.purpose }, this);
  }
}

const emptyState = (): KnowledgeState => ({ schemaVersion: 1, revision: 0, records: [], imports: {}, actions: [] });
const clone = <T>(value: T): T => structuredClone(value);
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
};
const keyedDigest = (text: string, key: string): string => {
  let a = 0x811c9dc5;
  const material = `${key}\u0000${text}`;
  for (let i = 0; i < material.length; i += 1) { a ^= material.charCodeAt(i); a = Math.imul(a, 0x01000193); }
  return (a >>> 0).toString(16).padStart(8, "0");
};

export interface InMemoryKnowledgeStateStore extends KnowledgeStateStore {
  raw(): Promise<string | undefined>;
  replaceRaw(raw: string): Promise<void>;
}

export function createInMemoryKnowledgeStateStore(): InMemoryKnowledgeStateStore {
  const integrityKey = `ephemeral-${Math.random()}-${Date.now()}`;
  let rawValue: string | undefined;
  const encode = (state: KnowledgeState) => {
    const payload = canonical(state);
    return JSON.stringify({ payload, signature: keyedDigest(payload, integrityKey) });
  };
  const decode = (raw: string): KnowledgeState => {
    let envelope: { payload?: unknown; signature?: unknown };
    try { envelope = JSON.parse(raw); } catch { throw new Error("corrupt knowledge state"); }
    if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") throw new Error("corrupt knowledge state");
    if (keyedDigest(envelope.payload, integrityKey) !== envelope.signature) throw new Error("knowledge state integrity check failed");
    let state: KnowledgeState;
    try { state = JSON.parse(envelope.payload); } catch { throw new Error("corrupt knowledge state payload"); }
    assertValidKnowledgeState(state);
    return state;
  };
  return {
    async read() { return rawValue === undefined ? emptyState() : clone(decode(rawValue)); },
    async compareAndSwap(expectedRevision, next) {
      const current = rawValue === undefined ? emptyState() : decode(rawValue);
      if (current.revision !== expectedRevision) return false;
      assertValidKnowledgeState(next);
      rawValue = encode(clone(next));
      return true;
    },
    async raw() { return rawValue; },
    async replaceRaw(raw) { rawValue = raw; },
  };
}

export function assertValidKnowledgeState(value: unknown): asserts value is KnowledgeState {
  const state = value as Partial<KnowledgeState> | null;
  if (!state || state.schemaVersion !== 1 || !Number.isInteger(state.revision) || (state.revision ?? -1) < 0 || !Array.isArray(state.records) || !Array.isArray(state.actions) || !state.imports || typeof state.imports !== "object") {
    throw new Error("corrupt knowledge state schema");
  }
  const ids = new Set<string>();
  const statuses = new Set<KnowledgeStatus>(["active", "uncertain", "superseded", "rejected", "erased"]);
  const kinds = new Set<KnowledgeKind>(["fact", "preference", "constraint", "goal", "decision", "hypothesis", "reference", "observation", "derived_insight"]);
  const epistemics = new Set<KnowledgeEpistemic>(["user-stated", "observed", "inferred", "external-unverified", "externally-verified", "derived"]);
  const sensitivities = new Set<KnowledgeSensitivity>(["normal", "private", "sensitive"]);
  const exposures = new Set<PersonaExposure>(["allowed", "blocked", "explicit-only"]);
  const jsonSafe = (candidate: unknown): boolean => {
    if (candidate === null || typeof candidate === "string" || typeof candidate === "boolean") return true;
    if (typeof candidate === "number") return Number.isFinite(candidate);
    if (Array.isArray(candidate)) return candidate.every(jsonSafe);
    return Boolean(candidate && typeof candidate === "object" && Object.getPrototypeOf(candidate) === Object.prototype && Object.entries(candidate as Record<string, unknown>).every(([key, nested]) => key.length > 0 && jsonSafe(nested)));
  };
  const validRecordShape = (record: KnowledgeRecord) => Boolean(record && typeof record.recordId === "string" && record.recordId && typeof record.importId === "string" && record.importId && typeof record.tenantId === "string" && record.tenantId && typeof record.ownerUserId === "string" && record.ownerUserId && typeof record.domain === "string" && typeof record.key === "string" && kinds.has(record.kind) && epistemics.has(record.epistemic) && statuses.has(record.status) && sensitivities.has(record.sensitivity) && exposures.has(record.personaExposure) && jsonSafe(record.value) && Array.isArray(record.sources) && !record.sources.some((source) => !source || typeof source.sourceId !== "string" || typeof source.sourceSystem !== "string" || typeof source.available !== "boolean" || Number.isNaN(Date.parse(source.capturedAt))) && Array.isArray(record.derivedFrom) && Array.isArray(record.contradicts) && Array.isArray(record.supersedes) && Array.isArray(record.supersededBy) && !Number.isNaN(Date.parse(record.recordedAt)) && !Number.isNaN(Date.parse(record.validFrom)) && (record.validTo === undefined || (!Number.isNaN(Date.parse(record.validTo)) && record.validTo >= record.validFrom)));
  for (const record of state.records) {
    if (!validRecordShape(record) || ids.has(record.recordId)) throw new Error("corrupt knowledge record schema");
    ids.add(record.recordId);
  }
  for (const record of state.records) for (const relation of [...record.derivedFrom, ...record.contradicts, ...record.supersedes, ...record.supersededBy]) {
    const target = state.records.find((candidate) => candidate.recordId === relation);
    if (!target || target.tenantId !== record.tenantId || target.ownerUserId !== record.ownerUserId) throw new Error("corrupt knowledge relation");
  }
  for (const target of Object.values(state.imports)) if (typeof target !== "string" || !ids.has(target)) throw new Error("corrupt knowledge import receipt");
  for (const action of state.actions) if (!action || typeof action.actionId !== "string" || typeof action.tenantId !== "string" || typeof action.ownerUserId !== "string" || !["correction", "erasure", "undo"].includes(action.type) || !Array.isArray(action.before) || action.before.some((record) => !validRecordShape(record) || record.tenantId !== action.tenantId || record.ownerUserId !== action.ownerUserId) || !Array.isArray(action.affectedRecordIds) || action.affectedRecordIds.some((id) => typeof id !== "string") || Number.isNaN(Date.parse(action.at)) || (action.undoneAt !== undefined && Number.isNaN(Date.parse(action.undoneAt)))) throw new Error("corrupt knowledge action schema");
}

const secretPattern = /(sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9]{20,}|eyj[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}|akia[a-z0-9]{16}|bearer\s+[a-z0-9._-]{16,}|-----begin [a-z ]*private key-----)/i;
const secretFieldPattern = /(^|[._-])(credential|secret|password|api[_-]?key|access[_-]?token)([._-]|$)/i;
const restrictedPublicDomains = new Set(["health", "family", "relationship", "relationships", "finance", "credentials", "secrets"]);
const normalizedDomain = (domain: string) => domain.trim().toLowerCase().split(/[.:/]/)[0];
const containsSensitiveMaterial = (value: unknown): boolean => {
  if (typeof value === "string") return secretPattern.test(value) || secretFieldPattern.test(value);
  if (Array.isArray(value)) return value.some(containsSensitiveMaterial);
  if (value && typeof value === "object") return Object.entries(value as Record<string, unknown>).some(([key, nested]) => secretFieldPattern.test(key) || containsSensitiveMaterial(nested));
  return false;
};
const containsSecret = (input: KnowledgeInput): boolean => containsSensitiveMaterial(input);
const publicEpistemicAllowed = new Set<KnowledgeEpistemic>(["user-stated", "observed", "externally-verified", "derived"]);
const isEffective = (record: KnowledgeRecord, at: string) => record.status !== "erased" && record.status !== "rejected" && record.validFrom <= at && (!record.validTo || record.validTo > at);
const isPublicEpistemicallySafe = (record: KnowledgeRecord, records: KnowledgeRecord[], at: string, seen = new Set<string>()): boolean => {
  if (!isEffective(record, at) || record.sensitivity === "sensitive" || record.personaExposure !== "allowed" || restrictedPublicDomains.has(normalizedDomain(record.domain))) return false;
  if (!publicEpistemicAllowed.has(record.epistemic)) return false;
  if (record.epistemic !== "derived") return true;
  if (record.derivedFrom.length === 0 || seen.has(record.recordId)) return false;
  const nextSeen = new Set(seen).add(record.recordId);
  return record.derivedFrom.every((id) => { const source = records.find((candidate) => candidate.recordId === id); return Boolean(source && source.tenantId === record.tenantId && source.ownerUserId === record.ownerUserId && isPublicEpistemicallySafe(source, records, at, nextSeen)); });
};

export class CanonicalKnowledgeAuthority {
  private readonly store: KnowledgeStateStore;
  private readonly now: () => string;
  private readonly authenticator: SupabaseKnowledgeAuthenticator;

  constructor(options: { store: KnowledgeStateStore; authenticator: SupabaseKnowledgeAuthenticator; now?: () => string }) {
    this.store = options.store;
    this.authenticator = options.authenticator;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private authorize(principal: KnowledgePrincipal, scope?: { agent: string; purpose: string }, write = false) {
    if (!principal || verifiedPrincipals.get(principal as object) !== this.authenticator) throw new Error("verified principal required");
    if (scope && (scope.agent !== principal.agent || scope.purpose !== principal.purpose)) throw new Error("knowledge scope denied");
    if (write && (principal.agent !== "erika" || principal.purpose !== "personal_assistance")) throw new Error("knowledge write denied");
  }

  private owns(principal: KnowledgePrincipal, record: KnowledgeRecord) {
    if (record.tenantId !== principal.tenantId || record.ownerUserId !== principal.userId) throw new Error("access denied");
  }

  async ingest(principal: KnowledgePrincipal, input: KnowledgeInput): Promise<KnowledgeRecord | { status: "SECRET_EXCLUDED"; recordId?: never }> {
    this.authorize(principal, undefined, true);
    if (containsSecret(input)) return { status: "SECRET_EXCLUDED" };
    for (let tries = 0; tries < 8; tries += 1) {
      const state = await this.store.read();
      const effectiveAt = this.now();
      const receiptKey = `${principal.tenantId}:${principal.userId}:${input.importId}`;
      const imported = state.imports[receiptKey];
      if (imported) {
        const existing = state.records.find((record) => record.recordId === imported);
        if (!existing) throw new Error("corrupt import receipt");
        return clone(existing);
      }
      const equivalent = state.records.find((record) => record.tenantId === principal.tenantId && record.ownerUserId === principal.userId && record.domain === input.domain && record.key === input.key && record.kind === input.kind && record.epistemic === input.epistemic && record.sensitivity === input.sensitivity && record.personaExposure === input.personaExposure && canonical(record.value) === canonical(input.value) && isEffective(record, effectiveAt));
      const next = clone(state);
      if (equivalent) {
        const target = next.records.find((record) => record.recordId === equivalent.recordId)!;
        const seen = new Set(target.sources.map((item) => `${item.sourceSystem}:${item.sourceId}`));
        target.sources.push(...input.sources.filter((item) => !seen.has(`${item.sourceSystem}:${item.sourceId}`)));
        next.imports[receiptKey] = target.recordId;
        next.revision += 1;
        if (await this.store.compareAndSwap(state.revision, next)) return clone(target);
        continue;
      }
      const sameKey = next.records.filter((record) => record.tenantId === principal.tenantId && record.ownerUserId === principal.userId && record.domain === input.domain && record.key === input.key && isEffective(record, effectiveAt));
      for (const sourceId of input.derivedFrom ?? []) {
        const sourceRecord = next.records.find((record) => record.recordId === sourceId);
        if (!sourceRecord || sourceRecord.tenantId !== principal.tenantId || sourceRecord.ownerUserId !== principal.userId) throw new Error("invalid derived source");
      }
      if (input.epistemic === "derived" && !(input.derivedFrom?.length)) throw new Error("derived knowledge requires sources");
      const inferredConflict = input.epistemic === "inferred" && sameKey.some((record) => record.epistemic === "user-stated");
      const recordId = `knowledge-${state.revision + 1}-${next.records.length + 1}`;
      const record: KnowledgeRecord = {
        ...clone(input), recordId, tenantId: principal.tenantId, ownerUserId: principal.userId,
        status: inferredConflict ? "uncertain" : "active", supersedes: [], supersededBy: [],
        contradicts: sameKey.map((item) => item.recordId), derivedFrom: [...(input.derivedFrom ?? [])],
      };
      for (const conflict of sameKey) {
        const existing = next.records.find((item) => item.recordId === conflict.recordId)!;
        if (!existing.contradicts.includes(recordId)) existing.contradicts.push(recordId);
      }
      next.records.push(record);
      next.imports[receiptKey] = recordId;
      next.revision += 1;
      if (await this.store.compareAndSwap(state.revision, next)) return clone(record);
    }
    throw new Error("knowledge state contention");
  }

  async query(principal: KnowledgePrincipal, scope: { agent: string; purpose: string; validAt?: string }): Promise<{ records: KnowledgeRecord[]; revision: number }> {
    this.authorize(principal, scope);
    const state = await this.store.read();
    const visible = state.records.filter((record) => record.tenantId === principal.tenantId && record.ownerUserId === principal.userId).filter((record) => {
      if (scope.agent === "persona_public" || scope.purpose === "public_content") return isPublicEpistemicallySafe(record, state.records, scope.validAt ?? this.now());
      return true;
    }).filter((record) => {
      const effectiveAt = scope.validAt ?? this.now();
      return isEffective(record, effectiveAt);
    });
    return { records: clone(visible), revision: state.revision };
  }

  async get(principal: KnowledgePrincipal, recordId: string, scope: { agent: string; purpose: string }): Promise<KnowledgeRecord | undefined> {
    this.authorize(principal, scope);
    const state = await this.store.read();
    const record = state.records.find((item) => item.recordId === recordId);
    if (!record) return undefined;
    this.owns(principal, record);
    if ((scope.agent === "persona_public" || scope.purpose === "public_content") && !isPublicEpistemicallySafe(record, state.records, this.now())) return undefined;
    return clone(record);
  }

  async evidence(principal: KnowledgePrincipal, recordId: string, scope: { agent: string; purpose: string }): Promise<{ recordId: string; sources: KnowledgeSource[]; derivedFrom: string[] }> {
    const record = await this.get(principal, recordId, scope);
    if (!record || record.status === "erased" || record.status === "rejected") throw new Error("access denied to evidence");
    return { recordId, sources: clone(record.sources), derivedFrom: [...record.derivedFrom] };
  }

  async correct(principal: KnowledgePrincipal, input: { recordId: string; value: unknown; recordedAt: string; validFrom: string; expectedRevision?: number }): Promise<{ status: "APPLIED"; recordId: string; actionId: string }> {
    this.authorize(principal, undefined, true);
    const state = await this.store.read();
    if (input.expectedRevision !== undefined && input.expectedRevision !== state.revision) throw new Error("revision conflict");
    const existing = state.records.find((item) => item.recordId === input.recordId);
    if (!existing) throw new Error("record not found");
    this.owns(principal, existing);
    if (existing.status !== "active" || existing.validTo || input.validFrom < existing.validFrom || input.recordedAt < existing.recordedAt) throw new Error("correction target is not current");
    if (containsSensitiveMaterial(input.value)) throw new Error("secret excluded");
    const next = clone(state);
    const old = next.records.find((item) => item.recordId === input.recordId)!;
    const recordId = `knowledge-${state.revision + 1}-${next.records.length + 1}`;
    const replacement: KnowledgeRecord = { ...clone(old), recordId, value: clone(input.value), recordedAt: input.recordedAt, validFrom: input.validFrom, validTo: undefined, status: "active", supersedes: [old.recordId], supersededBy: [], contradicts: [], importId: `${old.importId}:correction:${state.revision + 1}` };
    old.status = "superseded"; old.validTo = input.validFrom; old.supersededBy = [recordId];
    const actionId = `action-${state.revision + 1}`;
    next.records.push(replacement);
    next.actions.push({ actionId, tenantId: principal.tenantId, ownerUserId: principal.userId, before: [clone(existing)], affectedRecordIds: [existing.recordId, recordId], at: this.now(), type: "correction" });
    next.revision += 1;
    if (!await this.store.compareAndSwap(state.revision, next)) throw new Error("revision conflict");
    return { status: "APPLIED", recordId, actionId };
  }

  async erase(principal: KnowledgePrincipal, input: { recordId: string; reason: string }): Promise<{ status: "ERASED"; actionId: string }> {
    this.authorize(principal, undefined, true);
    const state = await this.store.read();
    const record = state.records.find((item) => item.recordId === input.recordId);
    if (!record) throw new Error("record not found");
    this.owns(principal, record);
    const next = clone(state);
    const erased = next.records.find((item) => item.recordId === input.recordId)!;
    erased.status = "erased"; erased.value = null; erased.importId = `erased:${erased.recordId}`; erased.supersededBy = [];
    for (const [receipt, recordId] of Object.entries(next.imports)) if (recordId === erased.recordId) delete next.imports[receipt];
    for (const action of next.actions) {
      const snapshot = action.before.find((item) => item.recordId === erased.recordId);
      if (snapshot) { snapshot.value = null; snapshot.importId = `erased:${snapshot.recordId}`; snapshot.status = "erased"; snapshot.supersededBy = []; }
    }
    const actionId = `action-${state.revision + 1}`;
    next.actions.push({ actionId, tenantId: principal.tenantId, ownerUserId: principal.userId, before: [clone(erased)], affectedRecordIds: [erased.recordId], at: this.now(), type: "erasure" });
    next.revision += 1;
    if (!await this.store.compareAndSwap(state.revision, next)) throw new Error("revision conflict");
    return { status: "ERASED", actionId };
  }

  async undo(principal: KnowledgePrincipal, input: { actionId: string; expectedRevision: number }): Promise<{ status: "UNDONE" }> {
    this.authorize(principal, undefined, true);
    const state = await this.store.read();
    if (state.revision !== input.expectedRevision) throw new Error("revision conflict");
    const action = state.actions.find((item) => item.actionId === input.actionId);
    if (!action || action.tenantId !== principal.tenantId || action.ownerUserId !== principal.userId) throw new Error("access denied");
    if (action.undoneAt) throw new Error("action already undone");
    if (action.type !== "correction") throw new Error("action is not reversible");
    if (!action.affectedRecordIds.every((recordId) => state.records.some((record) => record.recordId === recordId))) throw new Error("undo dependency conflict");
    if (state.records.some((record) => !action.affectedRecordIds.includes(record.recordId) && record.supersedes.some((recordId) => action.affectedRecordIds.includes(recordId)))) throw new Error("undo dependency conflict");
    const restoredIds = new Set(action.before.map((record) => record.recordId));
    if (Object.values(state.imports).some((recordId) => action.affectedRecordIds.includes(recordId) && !restoredIds.has(recordId))) throw new Error("undo dependency conflict");
    const next = clone(state);
    next.records = next.records.filter((record) => !action.affectedRecordIds.includes(record.recordId));
    next.records.push(...clone(action.before));
    next.actions.find((item) => item.actionId === action.actionId)!.undoneAt = this.now();
    next.actions.push({ actionId: `action-${state.revision + 1}`, tenantId: principal.tenantId, ownerUserId: principal.userId, before: [], affectedRecordIds: [...action.affectedRecordIds], at: this.now(), type: "undo" });
    next.revision += 1;
    if (!await this.store.compareAndSwap(state.revision, next)) throw new Error("revision conflict");
    return { status: "UNDONE" };
  }
}
