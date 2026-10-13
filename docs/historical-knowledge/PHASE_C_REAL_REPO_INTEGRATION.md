# Phase C real-repository integration

## Authority boundary

The slice follows the accepted flow:

`operational source -> canonical knowledge authority -> scoped projection / agent context`

`CanonicalKnowledgeAuthority` owns canonical records, correction history, contradictions, evidence, temporal reads, erasure and revision-based writes. Existing `MemoryStore`, Erika context, Persona Style/Format memory and Life Analytics remain operational sources or derived projections. They are not promoted to parallel canonical stores. `knowledge-adapters.ts` demonstrates migration boundaries for current `MemoryRecord` and `StyleMemoryObservation` without rewriting either subsystem.

## Authentication and tenancy

`SupabaseKnowledgeAuthenticator` validates the bearer token at the existing Supabase `/auth/v1/user` server boundary. Both owner and tenant scope derive from the verified user ID, matching the repository's current `user_id = auth.uid()` RLS convention; caller metadata cannot select another tenant. Agent/purpose scopes are fixed server configuration. An authority instance trusts exactly the authenticator instance injected at server construction, so a principal minted by a caller-created/fake authenticator is rejected. Record ownership is checked again for reads and mutations, and public Persona principals have no mutation authority. No production schema or policy was changed.

## Persistence and integrity

`knowledge-file-store.ts` is an isolated Node adapter for deterministic real-repository tests. It persists a versioned envelope through fsync plus atomic rename, signs the complete serialized authoritative state with HMAC-SHA256 using an injected key, rejects malformed/unsigned/tampered/deleted initialized state, and serializes cross-instance compare-and-swap through an expiring exclusive lock file. Keys are configuration, never source data. The adapter is intentionally not exported through the browser package index.

The in-memory store exists for fast contract tests only. It is also tamper-evident so corruption scenarios exercise the same fail-closed behavior, but it is not durability evidence.

## Privacy behavior

Sensitive records and blocked domains are filtered from public Persona projections. Evidence uses the same policy. Secret-like material and the credentials domain are rejected before a record or import receipt is created. Privacy erasure scrubs the value from the record, import receipts and historical undo snapshots while retaining a non-sensitive tombstone distinct from supersession.

## Phase C limits

- This candidate does not migrate historical data.
- It does not modify a production schema, deploy an endpoint, or rewire Erika/Persona runtimes.
- The local file adapter is replaceable by a future transactional Supabase repository that preserves the same CAS and policy contract.
- HMAC detects modification, not replay of an older valid envelope; production persistence must bind revision to a transactional/monotonic server-side anchor.
- The source Phase B and canonical JSON attachments were unavailable locally; the executable B-T01..B-T26 reconstruction is traceable in `PHASE_C_SCENARIO_MAP.md`.
- Final approval remains with independent Persona 5 review.
