# Architecture v0

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
LLM, speech-to-text and publishing providers live behind adapters. Core planning, rules, storage and history cannot depend on provider credits.

## Offline
Local durable storage is authoritative for immediate UX. Sync uses an outbox, retry/backoff, idempotency and conflict/version handling. Empty/unknown values remain null rather than invented defaults.
