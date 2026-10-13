# Phase C deterministic acceptance scenario map

The canonical JSON attachment referenced by issue #101 was not present in the local workspace and scratch commit `198530bb85b52f0f5c79fc2c97b009fc9630918c` was not reachable from the local repository. The 26 IDs below preserve the ordered canonical intent stated in issue #101 and the Phase C execution packet. The executable reconstruction is `packages/core/src/knowledge-authority.test.ts`.

| ID | Canonical scenario | Invariant exercised |
|---|---|---|
| B-T01 | Duplicate identical preference | Semantic deduplication |
| B-T02 | Repeated confirmation | Merge evidence without duplicating truth |
| B-T03 | Explicit later correction | Immutable replacement and supersession |
| B-T04 | Historical read before/after correction | Valid-time as-of query |
| B-T05 | Inference conflicts with explicit statement | Explicit knowledge remains authoritative |
| B-T06 | Repeated external-unverified claim | Repetition cannot promote epistemic status |
| B-T07 | Two sources disagree | Bidirectional contradiction links |
| B-T08 | Superseded architecture decision | Decision history retained |
| B-T09 | Repeated import | Import receipt idempotency |
| B-T10 | Equivalent knowledge from two systems | Cross-source deduplication |
| B-T11 | Provenance after dedupe | All distinct evidence retained |
| B-T12 | Sensitive health/family/relationship data | Public Persona deny-by-default |
| B-T13 | Evidence endpoint privacy | Evidence cannot bypass record policy |
| B-T14 | Cross-tenant read | Owner and tenant isolation |
| B-T15 | Cross-tenant write | Owner and tenant mutation isolation |
| B-T16 | Caller role escalation | Only server-issued principals accepted |
| B-T17 | Secret at ingestion | Excluded before canonical state/indexing |
| B-T18 | Source becomes unavailable | Provenance remains explicit and interpretable |
| B-T19 | Audit/undo | Revision-checked reversible transition |
| B-T20 | Corrupted persisted state | Fail-closed parsing/schema validation |
| B-T21 | Modified signed state | Integrity failure rejected |
| B-T22 | Concurrent correction | One deterministic CAS winner |
| B-T23 | Hero Identity 76/76 | Historical completion stored as COMPLETE |
| B-T24 | Missing raw answers | Availability separated from derived traits |
| B-T25 | Derived insight | Source record chain retained |
| B-T26 | Privacy erasure vs supersession | Value and receipts scrubbed; tombstone retained |

Supporting implementation-backed suites add server-authenticated scope verification, restart durability, HMAC tamper detection, cross-instance CAS and adapters from existing operational Memory/Style sources.
