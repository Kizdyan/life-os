# Architecture v1

User -> Erika -> Orchestrator -> Skills/Agents -> Typed Tools -> Domain Store / External Connectors

Cross-cutting:
- Policy Engine
- Observer
- Audit Log
- Undo
- Memory
- Analytics

## Erika
Erika turns natural language into an intent and proposed action plan. She never writes domain storage directly.

## Orchestrator
Routes work to the smallest sufficient execution graph. Simple work stays single-agent. Parallel agents are used only when research, review or independent verification benefits from them.

## Typed tools
All mutations are explicit commands with schemas, idempotency keys and logical action_group_id. A multi-step user command is one atomic logical group and exposes one undo operation when reversible.

## Observer
The executor's claim is not evidence. Observer re-reads persisted state or checks the external system and records verified/failed/uncertain.

## Provider boundary
LLM, speech-to-text, database, object storage, publishing and hosting providers live behind adapters. Core planning, rules, storage semantics, audit and history cannot depend on provider credits.

The production runtime is intentionally split into replaceable layers:

1. **Client replica** — iPhone/web keeps a durable local replica and outbox so Today, capture and outcome marking continue offline.
2. **Life OS API** — a same-origin API boundary accepts typed, idempotent mutations and returns canonical records/conflicts. Hosting can move without changing domain code or data semantics.
3. **Primary durable store** — a PostgreSQL-compatible database owns canonical Life OS tasks, outcomes, memory, settings, audit and sync revisions. Supabase can host this layer, but it is an adapter rather than the architecture.
4. **Media object store** — Yandex.Disk owns large media assets, references, project files and Media Brain service state. It is not the canonical task/memory database.
5. **AI providers** — GPT, Claude or local models consume typed context and tools; they never own the user's durable memory.

## Offline and sync
Local durable storage is authoritative only for immediate offline UX. The remote durable store is canonical for cross-device state, history and recovery.

Every local mutation carries:
- a globally unique mutation/idempotency id;
- the user id;
- record id and record kind;
- expected canonical record version;
- client timestamp and payload.

The primary store applies mutations with optimistic concurrency. Duplicate mutation ids replay safely without a second write. A stale expected version returns an explicit conflict with the current canonical record; the client must never silently claim success. Network failures remain in the outbox and retry with backoff.

## Hosting independence
A deploy target serves only the built frontend and the same-origin API runtime. It is disposable infrastructure: replacing Vercel, another serverless host or a conventional server must not require moving canonical user data or rewriting Life OS domain logic.

AppDeploy is not part of the production architecture and must not own Life OS data, secrets, memory, scheduling or background execution.
