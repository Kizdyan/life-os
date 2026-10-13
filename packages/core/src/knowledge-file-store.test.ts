import { createHmac } from "node:crypto";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CanonicalKnowledgeAuthority, SupabaseKnowledgeAuthenticator, type KnowledgeInput } from "./knowledge-authority";
import { createFileKnowledgeStateStore } from "./knowledge-file-store";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });
const fixture = async () => { const dir = await mkdtemp(join(tmpdir(), "life-os-knowledge-")); dirs.push(dir); return { path: join(dir, "state.json"), integrityKey: "phase-c-test-integrity-key" }; };
const authenticator = new SupabaseKnowledgeAuthenticator({ supabaseUrl: "https://example.supabase.co", publishableKey: "test-public-key", allowedScopes: [{ agent: "erika", purpose: "personal_assistance" }, { agent: "persona_public", purpose: "public_content" }], fetchImpl: async () => new Response(JSON.stringify({ id: "alice", app_metadata: { tenant_id: "tenant-a", roles: ["owner"], knowledge_scopes: ["erika:personal_assistance"] } }), { status: 200 }) });
const principal = () => authenticator.authenticate({ accessToken: "verified-test-token", agent: "erika", purpose: "personal_assistance" });
const input = (): KnowledgeInput => ({ importId: "restart-import", domain: "identity", key: "tone", kind: "preference", epistemic: "user-stated", value: "calm", recordedAt: "2026-10-13T08:00:00.000Z", validFrom: "2026-10-13T08:00:00.000Z", sensitivity: "private", personaExposure: "allowed", sources: [{ sourceId: "chat-1", sourceSystem: "chat", available: true, capturedAt: "2026-10-13T07:00:00.000Z" }] });

describe("durable canonical knowledge state", () => {
  it("restores canonical records after store recreation", async () => {
    const options = await fixture();
    await new CanonicalKnowledgeAuthority({ store: createFileKnowledgeStateStore(options), authenticator }).ingest(await principal(), input());
    const restarted = new CanonicalKnowledgeAuthority({ store: createFileKnowledgeStateStore(options), authenticator });
    expect((await restarted.query(await principal(), { agent: "erika", purpose: "personal_assistance" })).records[0].value).toBe("calm");
  });

  it("rejects a tampered durable envelope", async () => {
    const options = await fixture();
    const store = createFileKnowledgeStateStore(options);
    await new CanonicalKnowledgeAuthority({ store, authenticator }).ingest(await principal(), input());
    await writeFile(options.path, (await readFile(options.path, "utf8")).replace("calm", "tampered"), "utf8");
    await expect(createFileKnowledgeStateStore(options).read()).rejects.toThrow(/integrity/i);
  });

  it("fails closed for malformed durable state", async () => {
    const options = await fixture();
    await writeFile(options.path, "{bad json", "utf8");
    await expect(createFileKnowledgeStateStore(options).read()).rejects.toThrow(/corrupt/i);
  });

  it("allows only one cross-instance compare-and-swap winner", async () => {
    const options = await fixture();
    const first = createFileKnowledgeStateStore(options), second = createFileKnowledgeStateStore(options);
    const state = await first.read();
    const a = structuredClone(state), b = structuredClone(state); a.revision = 1; b.revision = 1;
    const results = await Promise.all([first.compareAndSwap(0, a), second.compareAndSwap(0, b)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await first.read()).revision).toBe(1);
  });

  it("fails closed when an initialized authority file disappears", async () => {
    const options = await fixture();
    const store = createFileKnowledgeStateStore(options);
    await new CanonicalKnowledgeAuthority({ store, authenticator }).ingest(await principal(), input());
    await rm(options.path);
    await expect(createFileKnowledgeStateStore(options).read()).rejects.toThrow(/missing after initialization/i);
  });

  it("recovers an expired lock whose owner process is gone", async () => {
    const options = await fixture();
    await writeFile(`${options.path}.lock`, JSON.stringify({ pid: 2_147_483_647, createdAt: Date.now() - 60_000, nonce: "dead" }), "utf8");
    expect((await createFileKnowledgeStateStore(options).read()).revision).toBe(0);
  });

  it("recovers an expired malformed crash lock by file age", async () => {
    const options = await fixture();
    const lockPath = `${options.path}.lock`;
    await writeFile(lockPath, "{}", "utf8");
    const old = new Date(Date.now() - 60_000); await utimes(lockPath, old, old);
    expect((await createFileKnowledgeStateStore(options).read()).revision).toBe(0);
  });

  it("does not steal an expired lock from a live owner", async () => {
    const options = await fixture();
    await writeFile(`${options.path}.lock`, JSON.stringify({ pid: process.pid, createdAt: Date.now() - 60_000, nonce: "live" }), "utf8");
    await expect(createFileKnowledgeStateStore({ ...options, lockAttempts: 2 }).read()).rejects.toThrow(/lock unavailable/i);
  });

  it("rejects a correctly signed but structurally invalid state", async () => {
    const options = await fixture();
    const payload = JSON.stringify({ schemaVersion: 1, revision: 1, imports: { receipt: "bad" }, actions: [], records: [{ recordId: "bad", importId: "bad", tenantId: "alice", ownerUserId: "alice", domain: "identity", key: "tone", kind: "fact", epistemic: "user-stated", recordedAt: "2026-01-01T00:00:00.000Z", validFrom: "2026-02-01T00:00:00.000Z", validTo: "2026-01-01T00:00:00.000Z", sensitivity: "private", personaExposure: "allowed", sources: [], status: "active", supersedes: [], supersededBy: [], contradicts: [], derivedFrom: [] }] });
    const signature = createHmac("sha256", options.integrityKey).update(payload, "utf8").digest("hex");
    await writeFile(options.path, JSON.stringify({ version: 1, payload, signature }), "utf8");
    await expect(createFileKnowledgeStateStore(options).read()).rejects.toThrow(/record schema/i);
  });
});
