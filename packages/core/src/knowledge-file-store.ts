import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { assertValidKnowledgeState, type KnowledgeState, type KnowledgeStateStore } from "./knowledge-authority";

interface FileStoreOptions {
  path: string;
  integrityKey: string;
  lockAttempts?: number;
}

interface Envelope { version: 1; payload: string; signature: string }
const empty = (): KnowledgeState => ({ schemaVersion: 1, revision: 0, records: [], imports: {}, actions: [] });

const signature = (payload: string, key: string) => createHmac("sha256", key).update(payload, "utf8").digest("hex");
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

export function createFileKnowledgeStateStore(options: FileStoreOptions): KnowledgeStateStore {
  if (!options.path || !options.integrityKey) throw new Error("durable knowledge path and integrity key are required");
  const lockPath = `${options.path}.lock`;
  const initializedPath = `${options.path}.initialized`;
  const attempts = options.lockAttempts ?? 500;

  const withLock = async <T>(work: () => Promise<T>): Promise<T> => {
    await mkdir(dirname(options.path), { recursive: true });
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    let ownerNonce: string | undefined;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const candidate = await open(lockPath, "wx");
        const nonce = randomUUID();
        try { await candidate.writeFile(JSON.stringify({ pid: process.pid, createdAt: Date.now(), nonce }), "utf8"); await candidate.sync(); }
        catch (error) { await candidate.close(); await unlink(lockPath).catch(() => undefined); throw error; }
        handle = candidate; ownerNonce = nonce; break;
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        try {
          const lock = JSON.parse(await readFile(lockPath, "utf8")) as { pid?: unknown; createdAt?: unknown };
          const stale = typeof lock.createdAt === "number" && Date.now() - lock.createdAt > 30_000;
          let alive = true;
          if (typeof lock.pid === "number") try { process.kill(lock.pid, 0); } catch { alive = false; }
          if (stale && !alive) { await unlink(lockPath); continue; }
        } catch {
          try { if (Date.now() - (await stat(lockPath)).mtimeMs > 30_000) { await unlink(lockPath); continue; } }
          catch { continue; }
        }
        await pause();
      }
    }
    if (!handle) throw new Error("knowledge state lock unavailable");
    try { return await work(); }
    finally {
      await handle.close();
      try { const current = JSON.parse(await readFile(lockPath, "utf8")) as { nonce?: unknown }; if (current.nonce === ownerNonce) await unlink(lockPath); }
      catch { /* Never remove a lock whose ownership cannot be proven. */ }
    }
  };

  const readUnlocked = async (): Promise<KnowledgeState> => {
    let raw: string;
    try { raw = await readFile(options.path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        try { await stat(initializedPath); throw new Error("corrupt durable knowledge state missing after initialization"); }
        catch (markerError) { if ((markerError as NodeJS.ErrnoException).code !== "ENOENT") throw markerError; }
        return empty();
      }
      throw error;
    }
    let envelope: Envelope;
    try { envelope = JSON.parse(raw) as Envelope; } catch { throw new Error("corrupt durable knowledge envelope"); }
    if (envelope?.version !== 1 || typeof envelope.payload !== "string" || typeof envelope.signature !== "string") throw new Error("corrupt durable knowledge envelope");
    const actual = Buffer.from(envelope.signature, "hex");
    const expected = Buffer.from(signature(envelope.payload, options.integrityKey), "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("durable knowledge integrity check failed");
    let state: unknown;
    try { state = JSON.parse(envelope.payload); } catch { throw new Error("corrupt durable knowledge payload"); }
    assertValidKnowledgeState(state);
    return structuredClone(state);
  };

  return {
    read: () => withLock(readUnlocked),
    compareAndSwap: (expectedRevision, next) => withLock(async () => {
      const current = await readUnlocked();
      if (current.revision !== expectedRevision) return false;
      assertValidKnowledgeState(next);
      if (next.revision !== expectedRevision + 1) throw new Error("invalid knowledge revision transition");
      const payload = JSON.stringify(next);
      const envelope: Envelope = { version: 1, payload, signature: signature(payload, options.integrityKey) };
      const temporaryPath = `${options.path}.${process.pid}.${Date.now()}.tmp`;
      const temporary = await open(temporaryPath, "wx");
      try { await temporary.writeFile(JSON.stringify(envelope), "utf8"); await temporary.sync(); }
      finally { await temporary.close(); }
      await rename(temporaryPath, options.path);
      await writeFile(initializedPath, "1", { encoding: "utf8", flag: "w" });
      return true;
    }),
  };
}
