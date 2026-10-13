# Persona Publisher V1 design

**Base:** `bac712b0e0bd0d3cda16b309178528c48903bce4`

Publisher V1 replaces the ambiguous Share Sheet flow with a server-oriented,
provider-neutral boundary. The canonical chain is `PersonaContentPackage ->
PublicationJob -> PublisherRouter -> PublisherAdapter -> provider ->
PublicationEvidence`. Only a provider-confirmed evidence record can produce
`PUBLISHED_CONFIRMED`; manual export, Share Sheet, opening Instagram, and an
accepted provider request are distinct outcomes.

The canonical job owns identity, state, attempts, retry decisions and evidence.
Adapters receive only an approved package plus the minimum account/platform
data. They never receive Life OS private context and cannot directly mutate the
canonical state. Durable optimistic concurrency in `DurableRuntimeStore`
prevents double taps and two workers from executing the same attempt.

Metricool is represented by a typed transport boundary. With no configured
transport or connected social account it reports `DISCONNECTED` and live
execution is `EXTERNAL_CONNECTION_PENDING`; no undocumented endpoint or fake
publication is used. The same adapter contract supports a future direct Meta
adapter.

V1 supports Instagram photo and carousel packages. Scheduling is provider-side
and survives browser closure. Reconciliation is mandatory after an unknown
response before another provider submission is allowed. Evidence is accepted
only when provider, job, idempotency key, platform, account and generation all
match.

