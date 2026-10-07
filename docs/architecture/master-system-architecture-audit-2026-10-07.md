# MASTER System Architecture Audit — Life OS / Erika / Persona / DiveM

Date: 2026-10-07
Status: architecture audit and migration proposal; no production behavior changed

## 1. Executive decision

The target concept is directionally correct, but its names currently mix three different things:

1. user-facing products (`Life OS`, `Persona`, `DiveM`);
2. interaction and orchestration roles (`Erika`, product orchestrator, development supervisor);
3. shared infrastructure (`runtime store`, event log, memory, media storage, analytics projections).

The system should be built as a **modular monolith with durable jobs and capability workers** for now. Each bounded context owns its contracts and decisions, while all contexts use one canonical identity, record, event, audit, decision, and artifact-reference layer. FFmpeg/Whisper workers, provider adapters, schedulers, and analytics importers may run as separate processes without becoming separate sources of truth.

Significant autonomous decisions pass through a shared **Decision Court / Deliberation Engine** inside the Product Orchestrator. The Court independently develops the strongest case for and against a proposal, audits evidence, collects blind specialist verdicts, and records a reasoned judgment before execution. Risk gating keeps ordinary reversible work outside the full Court. The Court is infrastructure, not a product, chat, or Persona subsystem.

The most important correction is this:

> One connected system does not mean one giant service or one giant schema. It means one canonical owner for every entity, one identifier across the lifecycle, and one durable event trail connecting decisions to outcomes.

The near-term product metric is a real published item and measured response, not the number of screens, agents, tests, or architectural layers. The shortest safe path is to connect the already working Persona and Video Engine pieces through canonical records, use one final human `Take / Change / Reject` gate, export a platform-ready file, record the publication, and ingest metrics. OAuth publishing, a Creative Router, and complete Life OS recovery can follow.

## 2. Audit scope and evidence

This audit used:

- local repository history and all locally available refs;
- remote refs fetched read-only for `recovery/iphone-static-supabase` and `feature/persona-content-factory`;
- open and closed GitHub PR inventory;
- all visible remote branch pages;
- open issues #1 and #86, including the canonical durable state embedded in #86;
- `docs/architecture/master-feature-recovery-2026-10-07.md` from the recovery branch;
- architecture, autonomy, Media Brain, deployment, Persona, and Video Engine documents;
- product code, domain contracts, runtime code, Supabase Edge code, tests, and the V1.1 video branch.

Key baselines at audit time:

| Line | Head | Relationship |
|---|---|---|
| Recovery / current production direction | `bfcfa84c7e1a579c8c029f777ddf57e711bba4a6` | 92 commits ahead of `feature/persona-content-factory`; no unique commits on the latter |
| Persona Content Factory | `a3521b75f5dae304fa96c2636ab7c8acc196501a` | ancestor of recovery branch |
| Local Persona Video V1.1 | `646f0708508c0fc603a43c555b771efe1176ee14` | 22 unique commits; merge-base with recovery is `16798d0` |
| Local autonomous/video integration line | `455bd340dc214e1780b8fc6d639811f5af9fb50b` | 5 unique commits relative to the old common base; substantially behind recovery product history |
| Remote `main` | `83131279e8a521f161ea805a0adb15f571ed8d48` | intentionally not the current integration target |

The branch topology is itself an architecture risk. The recovery branch contains the complete current Persona Content Factory history. The V1.1 video engine is a valid isolated donor line, but it diverged before most Persona and recovery work. It must be transplanted by package/contracts and adapter slices, not merged wholesale.

## 3. Findings from the current implementation

### 3.1 Strong foundations to preserve

The repository already contains valuable, compatible foundations:

- versioned runtime records, idempotent mutations, optimistic conflict detection, audit history, offline replica, and outbox;
- a static Render frontend with Supabase Edge/DB/Auth/Storage as the runtime boundary;
- typed action risk, policy, Observer verification, audit, and undo primitives;
- tasks, outcomes, recurrence, dependencies, reminders, scheduling, sleep/energy, and analytics primitives;
- provider-neutral media storage, immutable ingest/provenance, bounded jobs, Media Supervisor, Style Memory, Content Factory, publication contracts, and learning contracts;
- a real local-first Persona Video V1.1 pipeline with Russian Whisper.cpp STT, canonical transcript, EDL, loudness normalization, captions, vertical/platform outputs, artifact evidence, and zero-credit fallback;
- issue #86's durable development loop, stale/offline detection, independent roles, bounded retries, and rule that green CI is evidence rather than product acceptance.

These pieces should be connected and narrowed to clear ownership. Rewriting them would add risk without solving the current user-flow gaps.

### 3.2 Competing sources of truth

The most serious product problem is duplicated canonical state:

| Concept | Current competing representations | Consequence |
|---|---|---|
| Goals | Life `goal` runtime records; Erika profile `goals`; planner preferences | Erika may optimize against a different goal set from Life OS |
| Persona ideas | browser `lifeos:persona:ideas:v3`; browser history; core `PersonaProductionIdea`; MediaStateStore production idea | shooting, processing, and learning can refer to different objects |
| Persona memory | `PersonaMemoryRule`; Style Memory; Format Memory; browser history/session state | feedback can be applied twice or disappear with one client |
| Analytics | core analytics; life analytics; web analytics view; media analytics; Persona preference scoring | metrics lack one event lineage and can disagree by projection |
| Media workflow | Media Brain jobs; Content Factory candidates; Persona UI state; Video Engine filesystem runs | artifacts exist, but no single production lifecycle owns them |
| Runtime status | product runtime status; Media Supervisor state; issue #86 development runtime state | unrelated systems can be mistaken for one orchestrator |

The visible Persona screen still persists selected ideas, briefs, shooting results, and history directly in `localStorage`, while server-side Persona and media contracts already exist. The recovery work made the browser thinner for some memory operations, but the primary production flow still has a browser-owned parallel state machine.

### 3.3 Product and development orchestration are conflated

Issue #86 defines the **Autonomous Development Runtime**: Planner/Developer/QA/Critic/Release/Watchdog. It builds and releases the software.

The target system also needs a **Product Orchestrator**: it coordinates user-authorized life and media work. These must be separate state machines and separate queues. They may share libraries for leases, retries, checkpoints, verification, and `HUMAN_REQUIRED`, but they must not share job identity or business state.

Recommended names in code and documentation:

- `DevelopmentSupervisor` for issue #86;
- `ProductOrchestrator` for Life OS / Persona actions;
- domain supervisors such as `MediaSupervisor` as workers controlled by the product orchestrator.

### 3.4 The UI still exposes implementation modules

The production app places `Analytics`, `Persona/Контент`, runtime connection, life sensors, Erika profile editing, tasks, goals, and projects in one shell. This is useful for recovery, but it makes the user coordinate subsystem boundaries.

The target interaction should be:

- Erika is the default conversational entry point and explains choices;
- focused surfaces remain for review, calendar editing, evidence, and exceptional manual correction;
- technical runtime cards and worker status live under diagnostics;
- Persona shows a small decision queue, not internal production stages;
- Life OS surfaces remain direct and editable because calendar and task editing benefit from visual control.

Erika should reduce coordination work, not hide every structured surface.

### 3.5 Dead and overlapping paths

The web tree includes overlapping Persona paths (`PersonaFactory`, `PersonaCenter`, `PersonaToday`) and an unreferenced `MediaBrainCard`. Some are valuable donor implementations; they should not all remain active products. Reachability must be proven before deletion, then one Persona shell should survive.

The remote repository also contains dozens of temporary `test/persona-domain-*` and TDD verification branches. They provided historical evidence but now obscure the active topology. After confirming their commits are contained in recovery or another retained ref, archive/delete them and close explicitly temporary PRs.

## 4. Recommended system model

```text
User
  -> Erika (single conversational chief-of-staff interface)
  -> Product Orchestrator (intent graph, policy, jobs, checkpoints)
       -> Decision Gate / Decision Court for significant choices
  -> domain tools and specialist workers
       -> Life OS
       -> Persona
       -> DiveM Personal
       -> external/provider adapters
  -> verified real-world action
  -> observations and outcomes
  -> canonical data/event layer
  -> domain projections and learning
  -> Erika explanation / next decision
```

This is one logical system with explicit bounded contexts.

### 4.1 Life OS

Life OS owns facts about the user's life and execution:

- tasks, events, schedules, recurrence, dependencies, reminders, outcomes;
- projects, goals, weekly outcomes, next actions;
- sleep, energy, check-ins, actual execution, and other life observations;
- life-side audit/undo and user corrections.

Life OS does not own content-production state, media editing state, strategy assessments, or provider-native payloads.

### 4.2 Erika

Erika owns conversation and presentation:

- understand a request using authorized context;
- present decisions in plain language;
- propose a typed action graph;
- invoke Product Orchestrator tools;
- report verified results and exceptions;
- maintain conversational continuity through canonical memory references.

Erika owns no separate task, goal, media, or analytics database. `Erika memory` is a view over the shared memory ledger, with provenance, confidence, validity, supersession, and deletion.

### 4.3 Product Orchestrator

The Product Orchestrator owns execution coordination:

- intent/action graph and job dependencies;
- idempotency, leases, retries, checkpoints, timeout/stale recovery;
- policy and human-decision gates;
- routing to capabilities/providers;
- Observer assignments and evidence requirements;
- terminal state and scoped `HUMAN_REQUIRED`.
- decision risk/importance gating and Decision Court lifecycle;
- binding a judged decision to its executed action and measured outcome.

It does not make domain decisions that belong to Life OS, Persona, or DiveM. It calls their typed tools.

The Court is part of this orchestration layer. Erika may explain its final verdict, but Erika is not the Court. Persona and DiveM may supply proposals and specialist perspectives, but neither owns the shared deliberation mechanism.

### 4.4 Persona

Persona is the personal media execution and distribution context. It owns:

- content opportunities and ideas;
- editorial brief and shooting brief;
- shooting result and asset linkage;
- production job, technical processing record, candidate revisions;
- prepublish QA and final approval state;
- platform package, publication ledger, metrics, and content learning.

`Media Brain`, `Content Factory`, `Video Engine`, and future provider routing are Persona services, not separate products or data silos.

### 4.5 DiveM Personal

DiveM Personal is an owner-only strategy and diagnostic context. It may read authorized Life OS and Persona projections and write:

- private positioning hypotheses;
- opportunity/constraint assessments;
- prepublish strategic assessments;
- post-publication interpretations and recommendations.

It does not mutate Life OS facts or Persona production records directly. Recommendations become proposed actions through the Product Orchestrator.

### 4.6 DiveM Classic

DiveM Classic is a future commercial product with separate tenant isolation, authorization, storage, and lifecycle. It may reuse generic assessment contracts and algorithms, but it must not inherit:

- the owner's Life OS data;
- owner-only Persona memory;
- personal capability policy;
- private DiveM Personal assessments.

No shared table should rely on a boolean such as `isPersonal` as its only privacy boundary.

### 4.7 Shared Brain / canonical data and event layer

Shared Brain is infrastructure and a logical knowledge layer, not another user-facing app or autonomous product. It consists of:

- canonical entity identifiers and typed, versioned records in Supabase;
- append-only domain events/audit evidence and an outbox;
- append-only decision cases, proposal revisions, evidence classifications, verdicts, execution links, and outcome evaluations;
- an asset registry containing hashes, provenance, rights/consent, object references, and derivatives;
- a memory ledger with provenance/confidence/supersession/deletion;
- normalized observations and outcome events;
- query projections for Life Analytics, Persona learning, and DiveM assessments.

Large media bytes may remain in Yandex.Disk or another object store. Supabase owns the canonical metadata and references. “One source of truth” means one canonical metadata record for an asset, not one physical storage technology for every byte.

## 5. Canonical contracts

### 5.1 Common entity envelope

Every durable domain entity should have:

```ts
interface CanonicalEntity<T> {
  id: string;
  kind: string;
  ownerContext: "life" | "persona" | "divem_personal" | "orchestrator";
  schemaVersion: number;
  version: number;
  payload: T;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}
```

The existing runtime record/mutation substrate should be extended toward this contract. Do not replace it with a new database or full event-sourcing rewrite.

### 5.2 Common event envelope

```ts
interface DomainEvent<T> {
  id: string;
  type: string;
  schemaVersion: number;
  aggregateId: string;
  aggregateKind: string;
  ownerContext: string;
  correlationId: string;
  causationId: string | null;
  actor: { type: "user" | "agent" | "system" | "provider"; id: string };
  occurredAt: string;
  payload: T;
  evidenceRefs: string[];
}
```

The correlation ID must survive the entire media loop: life observation/opportunity → idea → brief → shooting → asset → processing → candidate → approval → publication → metrics → learning.

### 5.3 Decision contracts

Decision data is provider-neutral and separate from provider prompts/responses:

```ts
type DecisionMode = "DIRECT" | "LIGHTWEIGHT_CRITIQUE" | "FULL_COURT" | "HUMAN_REQUIRED";
type DecisionVerdict = "APPROVE" | "REVISE" | "REJECT" | "HUMAN_REQUIRED";
type EvidenceClass = "VERIFIED" | "INFERRED" | "ASSUMPTION" | "ESTIMATE" | "OPINION" | "UNAVAILABLE";

interface DecisionCase {
  id: string;
  correlationId: string;
  ownerContext: "life" | "persona" | "divem_personal" | "orchestrator" | "development";
  decisionType: string;
  mode: DecisionMode;
  status: "OPEN" | "REVISING" | "DECIDED" | "EXECUTED" | "EVALUATED";
  currentRevision: number;
  retryLimit: number;
  createdAt: string;
  decidedAt: string | null;
}

interface ProposalRevision {
  decisionId: string;
  revision: number;
  proposal: Record<string, unknown>;
  contextRefs: string[];
  submittedBy: string;
  submittedAt: string;
}

interface EvidenceFinding {
  claimId: string;
  claim: string;
  classification: EvidenceClass;
  evidenceRefs: string[];
  confidence: number | null;
  limitations: string[];
}

interface JurorVerdict {
  jurorRole: string;
  verdict: "APPROVE" | "REVISE" | "REJECT";
  confidence: number;
  rationale: string;
  criticalRisks: string[];
  requiredChanges: string[];
  submittedIndependently: true;
}

interface JudgeDecision {
  decisionId: string;
  revision: number;
  verdict: DecisionVerdict;
  confidence: number;
  rationale: string;
  dissent: string[];
  requiredChanges: string[];
  humanAction: string | null;
  historicalOutcomeRefs: string[];
}
```

Provider-native traces may be retained as restricted diagnostics, but canonical decision history stores roles, evidence, verdicts, and provenance rather than model-specific payload structures.

### 5.4 Canonical media lifecycle

The minimum canonical chain is:

```text
ContentOpportunity
  -> PersonaIdea
  -> ShootingBrief (revisioned)
  -> ShootingResult
  -> MediaAsset (immutable source metadata)
  -> ProcessingRun
  -> ContentCandidate (revisioned)
  -> ApprovalDecision
  -> PlatformVariant
  -> PublicationRecord
  -> MetricSnapshot
  -> LearningObservation
```

Video Engine filesystem artifacts remain immutable technical evidence. Persona persists stable artifact references and processing facts; it does not copy FFmpeg/Whisper-specific structures into canonical state.

## 6. Agent and filter architecture

Agents are roles operating on typed contracts. They should not each receive an independent memory or database.

### 6.1 Media pipeline roles

| Stage | Responsible role/capability | Required critic/filter | Output |
|---|---|---|---|
| Opportunity | Context researcher | relevance, privacy, obligation load | ranked `ContentOpportunity` |
| Idea | Content strategist | factuality, repetition, strategic fit | persisted `PersonaIdea` |
| Brief | Editorial planner / Shooting Director | shootability, available facts/resources | revisioned `ShootingBrief` |
| Capture | Capture assistant | completeness, media integrity | `ShootingResult` + `MediaAsset` |
| Technical processing | Persona Video Engine | decode, QA, transcript, loudness, caption bounds | `ProcessingRun` + verified artifacts |
| Editorial package | Content Factory | hook, pacing, factuality, platform fit | revisioned `ContentCandidate` |
| Strategic review | DiveM Personal | positioning/funnel fit | assessment, never direct mutation |
| Prepublish | Independent QA/brand/safety critic | terminology, factual support, rights, platform checks | pass/rework with evidence |
| Decision | Erika review card | no hidden failures | `Take / Change / Reject` |
| Publish | Platform adapter or assisted publish | idempotency + post-action Observer | `PublicationRecord` |
| Measure | Analytics importer | source freshness and metric validity | `MetricSnapshot` |
| Learn | Persona learning | minimum evidence, taste/performance separation | weighted `LearningObservation` |

Each failed filter returns a typed rework request to the preceding owner. The user is interrupted only when the system needs a subjective choice, unavailable fact, sensitive approval, credential/2FA, or irreversible public action outside prior policy.

### 6.2 Human attention policy

| State | System behavior | User involvement |
|---|---|---|
| `AUTO` | research, generate, process, compare, test, rework | none |
| `AUTO_REPORT` | low-risk recurring work with verified digest | review later |
| `DECISION_REQUIRED` | several viable subjective options | `Take / Change / Reject` |
| `APPROVAL_REQUIRED` | public, sensitive, paid, destructive, or account action | explicit approval |
| `HUMAN_REQUIRED` | physical capture, 2FA/CAPTCHA, missing fact/credential, non-automatable acceptance | exact action and blocked scope |

`HUMAN_REQUIRED` must be scoped to one job/dependency. Unrelated jobs continue.

## 7. Decision Court / Deliberation Engine

### 7.1 Purpose and boundary

Decision Court improves important autonomous decisions before execution while reducing unnecessary user coordination. It is a shared Product Orchestrator capability used by Life OS, Persona, and DiveM Personal. The Autonomous Development Runtime may reuse the same contracts and evaluation library, but it persists its own development cases and never shares its execution queue with the product system.

The Court is read-only with respect to domain state during deliberation. It may produce a judgment and an authorization token. Only the Product Orchestrator can dispatch the judged proposal to a domain tool, and only that domain tool can mutate its canonical records.

### 7.2 Full pipeline

```text
Proposal
  -> Advocate
  -> Challenger
  -> Evidence Auditor
  -> Independent Specialist Jury
  -> Judge
  -> APPROVE / REVISE / REJECT / HUMAN_REQUIRED
  -> Execution
  -> Outcome Measurement
  -> Calibration / Learning
```

- **Advocate** constructs the strongest truthful case for the proposal: upside, opportunities, why it may work, and why alternatives may be weaker. It may not relabel assumptions as facts.
- **Challenger** constructs the strongest case against it: weak premises, hidden costs, opportunity cost, failure modes, risks, and alternatives.
- **Evidence Auditor** independently classifies every material claim as verified, inferred, assumption, estimate, opinion, or unavailable. Unsupported agreement between agents is not evidence.
- **Specialist jurors** assess the proposal independently before seeing other votes. Each returns verdict, confidence, rationale, critical risks, and required changes.
- **Judge** weighs the proposal, arguments, evidence audit, independent verdicts, dissent, and relevant historical outcomes. It is not bound by majority vote.

The default specialist registry is decision-specific:

| Decision family | Candidate perspectives |
|---|---|
| Persona concept/publication | marketing, audience, personal brand, creative, script, directing, production, distribution, analytics, resources, risk |
| Life planning/strategy | planning, wellbeing, goals, resources, opportunity cost, risk |
| DiveM Personal strategy | positioning, opportunity, execution, resources, risk, evidence |
| Software architecture/release | architecture, product, QA, reliability, security, data integrity, UX, maintainability, cost/complexity |

The Orchestrator selects the smallest sufficient subset. Full Persona Court normally uses three to five materially distinct perspectives, not every role in the registry.

### 7.3 Risk and importance gating

The gate evaluates reversibility, blast radius, uncertainty, cost, data impact, public/external impact, strategic importance, confidence, and novelty. Hard constraints override any numeric score.

| Level | Mode | Use |
|---|---|---|
| 0 | `DIRECT` | cheap, local, reversible, well-understood actions with no material external effect |
| 1 | `LIGHTWEIGHT_CRITIQUE` | bounded decisions where one independent critic or advocate/challenger pair materially reduces error |
| 2 | `FULL_COURT` | strategic, architectural, public-content, cross-domain, novel, expensive, or high-uncertainty decisions |
| 3 | `HUMAN_REQUIRED` | prohibited autonomous decisions: legal/financial commitment, credentials/2FA, destructive data, irreversible public risk, unavailable subjective fact, or policy-required consent |

The gate uses both factor scores and hard rules:

- any prohibited/credential/destructive/legal condition selects Level 3;
- material public impact, cross-domain strategy, high novelty, or high uncertainty selects at least Level 2;
- one bounded but meaningful risk selects at least Level 1;
- only fully reversible, low-cost, known operations qualify for Level 0.

Examples where full Court is not needed:

- resizing, transcoding, caption rendering, checksum calculation, metadata extraction;
- deterministic sync retry, idempotent export, safe cache rebuild;
- ordinary task CRUD explicitly requested by the user;
- applying an already approved bounded plan;
- collecting metrics or running tests;
- correcting a proposal exactly as required by a prior judgment.

Examples for full Court:

- selecting the main content concept or public narrative;
- approving a strategically important publication candidate;
- changing Persona positioning or content strategy;
- materially changing a user's weekly plan based on uncertain recommendations;
- making a high-impact architecture/release decision in #86.

### 7.4 Bounded revision loop

`REVISE` returns typed required changes to the proposal owner. The owner creates the next `ProposalRevision`; the Court reruns only the roles affected by the change plus the Evidence Auditor and Judge. It does not ask the user automatically.

The default v0 limit is two revision cycles. A case then ends in `APPROVE`, `REJECT`, or scoped `HUMAN_REQUIRED`. A third autonomous rewrite requires a decision-type policy override supported by evidence. Time, token, provider-call, and wall-clock budgets are recorded with the case.

### 7.5 Tool/API boundary

The minimum provider-neutral Court surface is:

```ts
interface DecisionCourt {
  classify(input: DecisionGateInput): Promise<DecisionGateResult>;
  open(input: OpenDecisionInput): Promise<DecisionCase>;
  submitProposal(input: ProposalRevisionInput): Promise<ProposalRevision>;
  buildAdvocateCase(decisionId: string, revision: number): Promise<ArgumentRecord>;
  buildChallengerCase(decisionId: string, revision: number): Promise<ArgumentRecord>;
  auditEvidence(decisionId: string, revision: number): Promise<EvidenceAudit>;
  collectJury(decisionId: string, revision: number, roles: string[]): Promise<JurorVerdict[]>;
  judge(decisionId: string, revision: number): Promise<JudgeDecision>;
  authorizeExecution(decisionId: string, revision: number): Promise<ExecutionAuthorization>;
  recordExecution(input: DecisionExecutionLink): Promise<void>;
  recordOutcome(input: DecisionOutcomeEvaluation): Promise<void>;
}
```

`authorizeExecution` succeeds only for the exact approved proposal revision and expires after a bounded time. Domain tools receive `decisionId`, `revision`, `correlationId`, and authorization evidence. They still apply their own policy, validation, idempotency, and permission checks.

### 7.6 Audit, undo, and provenance

Decision history is append-only. It records proposal/context references, both arguments, claim classifications, juror identity by role/provider class, individual blind verdicts, confidence, dissent, judgment, revisions, execution link, actual outcome, and later evaluation.

The Court does not implement domain undo. The executed domain action records the decision reference in the existing audit/action group, and the owning domain supplies compensation where the action is reversible. Undo never erases decision history; it appends an execution reversal outcome.

Sensitive evidence is stored by reference and checked through the originating domain's access policy. Jurors receive only the minimum authorized projection. DiveM Classic never receives owner-only Life OS or DiveM Personal evidence.

### 7.7 Outcome calibration

Calibration compares predicted risks and expected outcomes with actual results. It may estimate which perspectives are well-calibrated, systematically optimistic/pessimistic, or useful for a given decision family.

Calibration rules:

- require a minimum sample before changing any weight;
- cap all learned weight changes;
- keep safety/policy constraints immutable to calibration;
- keep user taste separate from public performance;
- retain dissent rather than training only on the winning verdict;
- allow abstention when evidence is insufficient;
- make weights advisory to the Judge, never automatic authorization.

Useful quality metrics are decision regret, human override rate, revision yield, calibration error, outcome lift over lightweight critique, latency, and compute/provider cost. Agent count is not a quality metric.

### 7.8 Adversarial review: avoiding multi-agent theatre

Decision Court becomes expensive theatre when:

- it runs for low-stakes deterministic work;
- Advocate, Challenger, jurors, and Judge use the same evidence and near-identical prompts;
- agents reward agreement or rhetorical volume rather than verified claims;
- the Judge counts votes without evaluating evidence or dissent;
- no actual outcome is linked back to the decision;
- the system adds jurors after an unwanted verdict until it gets a preferred answer;
- provider diversity is purchased without evidence that it changes error modes;
- deliberation costs more than the downside it can prevent;
- users still have to resolve internal disagreements that the Court should settle.

Controls:

1. Gate aggressively; target most operations at Level 0 or 1.
2. Use the smallest distinct jury and run jurors independently in parallel.
3. Freeze proposal/context/evidence inputs for a revision so roles debate the same case.
4. Require claim-level evidence classification before judgment.
5. Enforce retry, latency, token, and external-cost budgets.
6. Prevent juror shopping and post-verdict panel expansion.
7. Compare full Court outcomes against lightweight critique by decision family.
8. Downgrade or disable full Court where measured quality lift is absent.
9. Keep deterministic QA and policy checks outside generative deliberation.
10. Escalate only the unresolved user decision, not the internal transcript.

The Court earns its complexity only when measured outcomes show fewer bad autonomous actions, fewer user interruptions, or better strategic results.

## 8. Ownership map

| Feature | Canonical owner | Canonical data source | Agents/services | Filters / QA | Output | Feedback destination | Human involvement |
|---|---|---|---|---|---|---|---|
| Tasks/calendar/outcomes | Life OS | Supabase runtime records | planner, scheduler, execution tools | conflict, Observer, audit/undo | verified plan/outcome | Life observations | edit/approve exceptional changes |
| Goals/projects | Life OS | goal/project records | goal planner | hierarchy and next-action consistency | goal graph | Life analytics and Erika context | choose priorities |
| Sleep/energy/check-ins | Life OS | life observation records | sensor adapters | validity, provenance, sparse-input rules | normalized observations | Life analytics | supply unavailable measurements |
| Conversation | Erika | transcript + referenced canonical context | STT, reasoning, response | intent coverage, policy | explanation/action proposal | memory ledger and audit | speak/type; choose when asked |
| Long-term memory | Shared Brain, schema owned by source domain | memory ledger | extraction, reconciliation | provenance/confidence/supersession | memory projection | Erika/domain tools | correct/delete facts |
| Action graph | Product Orchestrator | durable job/checkpoint records | router, workers, Observer | policy, retry, stale detection | verified terminal state | audit/events | only scoped gates |
| Significant decision | Product Orchestrator / Decision Court | decision case + evidence/outcome ledger | Advocate, Challenger, Evidence Auditor, selected jurors, Judge | independent evidence audit, dissent, bounded revision | approved/rejected/revised proposal with authorization evidence | execution outcome and calibration | final subjective/prohibited choice only |
| Development automation | DevelopmentSupervisor (#86) | issue/runtime-state and CI | planner/dev/QA/critic/release/watchdog | CI, product QA, production QA | release evidence | development backlog | credentials/production approvals |
| Content opportunity | Persona | opportunity record with Life references | researcher/strategist | relevance, privacy, workload | ranked opportunity | Persona learning | optional reject/change |
| Idea and brief | Persona | Persona idea + revisioned brief | strategist, editorial planner, Shooting Director | facts, novelty, shootability | shoot-ready brief | Persona lifecycle | `Take / Change / Reject` |
| Media asset | Persona asset registry | Supabase metadata + Yandex object reference | ingest worker | hash, provenance, rights, decode | immutable source asset | processing and audit | provide/approve source |
| Technical video | Persona Video Engine | immutable input + run directory | FFmpeg, Whisper.cpp/provider adapters | technical QA and artifact verification | clean/captioned/platform files | Persona processing record | none unless input invalid |
| Editorial candidate | Persona Content Factory | canonical idea/assets/processing refs | editorial workers | hook, factuality, readability, platform fit | revisioned candidate | approval queue | final subjective decision |
| Strategy assessment | DiveM Personal | authorized Life/Persona projection | strategy analyst | evidence and privacy | assessment/recommendation | Product Orchestrator | accept/change direction |
| Publication | Persona | publication ledger | platform adapter / assisted publish | approval, idempotency, Observer | external URL/ID | metrics importer | approval/2FA where required |
| Content analytics | Persona | platform metric snapshots | importers, analytics | freshness, attribution, sample size | performance projection | Persona learning + DiveM Personal | none |
| Life analytics | Life OS | normalized life observations | aggregate/insight workers | sample size, non-causal language | trends/insights | Erika and goal planning | correct bad data |
| DiveM Classic | DiveM Classic | separate tenant data | commercial strategy services | tenant isolation | customer assessment | customer-owned store | customer policy |

## 9. What is wrong in the current concept

1. **“Shared Brain” risks becoming a new super-product.** It should be a canonical ledger and projection layer, with domain ownership retained.
2. **Erika is described as both UI and brain/data owner.** Erika should orchestrate and explain; durable facts remain in domain stores.
3. **Persona, Media Brain, Content Factory, and Video Engine overlap as products.** They are one Persona bounded context with specialist services.
4. **The product orchestrator and issue #86 development supervisor are easy to confuse.** They solve different problems and need different queues.
5. **“One system” can be misread as one monolith.** Capability workers and adapters should stay isolated; canonical contracts connect them.
6. **The architecture overvalues autonomous stages before the first publication loop closes.** A manually assisted final upload is acceptable for the first proof if all preceding artifacts and the publication ledger are real.
7. **The current browser still owns Persona lifecycle state.** This contradicts the intended durable shared brain.
8. **Goals and memory have duplicate models.** This will make Erika's advice inconsistent even when each individual module passes tests.

## 10. What to preserve, combine, stop, and add

### Preserve

- offline replica/outbox, mutation versions, conflict handling, audit, undo;
- Supabase runtime and Render static hosting;
- provider-neutral adapters and local zero-credit fallbacks;
- immutable media ingest and asset provenance;
- Persona Video V1.1 as an isolated technical engine;
- approval/publication contracts and taste/performance separation;
- issue #86 durable development discipline and product-level Definition of Done.

### Combine

- all goals into Life OS goal/project/weekly-outcome records;
- Persona browser ideas, core production ideas, and media-state ideas into one canonical Persona model;
- Style Memory, Format Memory, and Persona feedback into one evidence ledger with typed dimensions and projections;
- analytics implementations behind one normalized observation/event stream and domain-specific projections;
- Media Brain, Content Factory, Video Engine, approval, publication, and content analytics under Persona ownership;
- technical artifact references into the shared asset registry.

### Delete or do not build now

- no separate Shared Brain UI/product;
- no separate Erika database;
- no new Media OS screens that expose worker stages to the user;
- no all-purpose “AI editor” or Creative Router before one publication loop is proven;
- no undocumented CapCut integration or provider-credit dependency on the critical path;
- no Vercel runtime restoration;
- no new names/renames for existing user chats, projects, or folders;
- no deep Runway/Descript/CapCut/OAuth work in the first publication milestone;
- no parallel goal, memory, idea, or publication schemas;
- no blanket merge of the divergent video branch;
- no retention of temporary test branches after containment is verified.

### Missing and required

- an ownership registry/ADR for every canonical entity and event;
- provider-neutral Decision Court records, gating, authorization, and outcome links;
- a stable cross-domain correlation/causation ID;
- durable product jobs with dependencies, retries, dead-letter/rework, and scoped human gates;
- canonical asset metadata including rights/consent and derivative lineage;
- a publication ledger and Observer-verified external result;
- platform metric ingestion with attribution to the exact candidate revision;
- a provider-neutral Erika tool registry and memory ledger;
- explicit DiveM Personal privacy/authorization and DiveM Classic tenant separation;
- one real end-to-end Persona production flow in the PWA;
- branch/PR lifecycle policy that leaves one current integration trunk.

## 11. Branch and PR disposition

| Ref | Recommendation | Reason |
|---|---|---|
| `recovery/iphone-static-supabase` / PR #85 | use as the only current integration base after review | it contains the full Persona Content Factory head plus 92 recovery/autonomy commits |
| `feature/persona-content-factory` / PR #49 | mark superseded after PR #85 is accepted; do not merge separately | it is an ancestor with zero unique commits relative to recovery |
| `feature/autonomous-runtime-v1` / PR #46 | use only as historical/donor evidence; close after required commits are transplanted | it targets `main`, is hundreds of commits behind recovery, and contains a divergent architecture line |
| `codex/persona-video-v1` | retain as donor until package/contracts, V1.1, tests, and evidence are transplanted | 22 valuable isolated commits; wholesale merge would cross 386 recovery commits |
| `ci/analytics-red-check` / PR #51 | close as explicitly temporary | its PR description says “do not merge” |
| `tdd/erika-durable-goal-planning` / PR #83 | rebase/transplant only after canonical goal ownership is fixed | otherwise it reinforces Erika-profile goals as a second source of truth |
| `test/persona-domain-*` and completed TDD branches | archive/delete after containment audit | they obscure active topology and no longer represent product lines |

Do not merge any of these to `main` as part of this audit.

## 12. Migration strategy

### Option A — keep adding to current screens

Fast for individual demos, but it preserves browser-owned state, duplicated models, and manual coordination. Rejected.

### Option B — split immediately into microservices

This would create deployment, identity, transaction, observability, and schema-versioning work before the product loop exists. Rejected for now.

### Option C — modular monolith plus capability workers

Recommended. Keep one TypeScript domain/runtime repository and Supabase canonical store. Isolate video/STT, polling, analytics import, and provider calls behind queues and adapters. Extract services only when load, security, or deployment independence requires it.

### Migration slices

#### Slice 0 — establish one integration line

1. Review and accept PR #85 as the current non-`main` integration base.
2. Record the three authoritative refs: recovery, V1.1 video donor, and remote `main`.
3. Close/supersede ancestor and temporary PRs after containment checks.
4. Add a branch retention rule for TDD/test branches.

Acceptance: one documented integration branch; no lost unique commit; no `main` merge.

#### Slice 1 — canonical ownership and IDs

1. Add the ownership ADR and canonical entity/event envelopes.
2. Extend runtime kinds/schema versions without replacing the storage substrate.
3. Map existing IDs and introduce correlation IDs.
4. Define one canonical `PersonaIdea`, `ShootingBrief`, `ShootingResult`, `MediaAsset`, and `ProcessingRun`.

Acceptance: every persisted object in the target publish flow has one owner and one durable record.

#### Slice 1B — Decision Court v0 foundation

1. Add provider-neutral decision/gating contracts and one durable `decision_case` record family.
2. Implement hard Level 3 rules and deterministic Level 0–2 classification.
3. Add role adapter interfaces, a static specialist registry, and a Judge boundary.
4. Enforce blind juror submissions, evidence classifications, two revision cycles, and execution authorization tied to an exact proposal revision.
5. Link the decision to the existing audit/action group; do not add a new Court UI.

Acceptance: one significant test proposal completes full Court, one ordinary technical action bypasses it, and no verdict can mutate domain state directly.

#### Slice 2 — move Persona lifecycle out of browser ownership

1. Make the Persona screen a replica/client of canonical Persona records.
2. Migrate local idea/brief/result state idempotently.
3. Preserve offline edits through the existing outbox.
4. Remove parallel browser keys only after verified migration and rollback evidence.

Acceptance: reload/new session returns the same idea, brief, shooting result, and decision from canonical storage.

#### Slice 3 — connect the existing video engine

1. Transplant `packages/persona-video` and its tests from `646f070` onto the recovery head.
2. Merge only workspace/package configuration changes required by the package.
3. Adapt the existing bridge to canonical Persona records and MediaAsset references.
4. Persist processing/artifact references and preserve local-first execution.

Acceptance: canonical shooting result → V1.1 run → verified platform artifacts → canonical processing record.

#### Slice 4 — one review and publish handoff

1. Create one candidate revision from the processed artifacts.
2. Run deterministic technical, factual, brand, rights, and platform filters.
3. Run a bounded Level 2 Court for the significant public-content decision; use a small Persona jury and reuse the factual evidence audit.
4. Let the system resolve `REVISE` autonomously within the retry budget.
5. Present only `Take / Change / Reject` plus the Judge's short explanation.
6. For the first publication, allow assisted/manual platform upload and record URL/ID/time in the publication ledger.

Acceptance: one real item is published and traceable to its exact input, brief, processing run, candidate revision, and approval.

#### Slice 5 — metrics and learning

1. Import or manually record first platform snapshots.
2. Link metrics to the publication/candidate revision.
3. Store taste and performance as separate evidence.
4. Link actual results to the originating decision case.
5. Produce the next recommendation with explicit evidence and confidence.

Acceptance: publication → metrics → learning observation → next ranked idea.

#### Slice 6 — Erika as the front door

1. Add a typed tool registry over the proven domain flows.
2. Make Erika use canonical Life goals and memory.
3. Let Erika show job state and scoped human requests.
4. Keep direct calendar/review surfaces available.

Acceptance: a natural request creates or advances the same canonical records as the structured UI, with Observer evidence and undo where applicable.

#### Slice 7 — DiveM boundaries

1. Implement DiveM Personal as a private assessment service over authorized projections.
2. Route recommendations through Product Orchestrator proposals.
3. Define DiveM Classic tenant and API boundaries separately.

Acceptance: no private owner data is reachable from the Classic tenant or generic service path.

## 13. Prioritized backlog

### P0 — first real publication loop

1. `ARCH-OWNERSHIP-001`: canonical ownership/event/correlation ADR.
2. `BRANCH-TRUNK-001`: choose PR #85 recovery head as sole integration base; disposition stale PRs/branches.
3. `COURT-CONTRACT-001`: Decision Court records, Level 0–3 gate, exact-revision authorization, and bounded revision contract.
4. `PERSONA-CANONICAL-001`: consolidate idea/brief/result state and migrate browser state safely.
5. `PERSONA-SHOOT-001`: fix production shooting-brief E2E against canonical state.
6. `VIDEO-INTEGRATE-001`: transplant V1.1 package and bridge onto recovery head.
7. `COURT-PERSONA-V0-001`: small evidence-audited Court for idea/prepublish decisions; bypass technical exports.
8. `PERSONA-REVIEW-001`: one candidate, independent QA, `Take / Change / Reject`.
9. `PUBLISH-LEDGER-001`: assisted/manual first publish with verified URL/ID and immutable lineage.
10. `METRICS-FIRST-001`: first real metric snapshot, decision outcome, and learning observation.

### P1 — reliability and user trust

1. Complete issue #86 open security, local-corruption, service-worker, and mobile E2E items.
2. Generalize audit/undo/offline behavior to all new domain mutations.
3. Add artifact rights/consent metadata and publication safety checks.
4. Add durable Product Orchestrator jobs and scoped human gates.
5. Consolidate memory and analytics projections.
6. Measure Court quality/latency/cost against lightweight critique before expanding its use.

### P2 — Life OS and Erika completion

1. Finish Life Core surfaces and execution semantics from the recovery matrix.
2. Make Life goals the only planning goal source.
3. Add Erika tool registry, canonical memory, and full intent coverage.
4. Build longitudinal Life Analytics from normalized observations.

### P3 — optional capability expansion

1. platform publishing OAuth and analytics adapters;
2. Persona Creative Router;
3. Descript/Runway/CapCut enhancement providers;
4. face-aware tracking and artistic selection;
5. DiveM Personal automation, then separately scoped DiveM Classic.

### 13.1 Reality inventory classification

| Class | Existing reality and action |
|---|---|
| `REUSE` | runtime records/mutations, offline outbox, conflict handling, policy, Observer, audit/undo, MediaStateStore, Media Supervisor, immutable ingest, Style/Format Memory evidence, Content Factory, Persona publication contracts, issue #86 role/state-machine patterns, V1.1 Video Engine |
| `RESTORE` | production Persona shooting brief, canonical Persona queue/review, Life Core product surfaces, full Erika intent coverage, mobile/offline acceptance paths identified in recovery matrix |
| `CONNECT` | Persona lifecycle to canonical runtime; shooting result to MediaAsset; recovery head to V1.1 package; candidate approval to publication ledger; publication to metrics; Judge authorization to domain audit/action group |
| `BUILD` | canonical entity/event ownership, Product Orchestrator jobs, Decision Court v0, decision/outcome ledger, asset rights lineage, first assisted publish record, metrics attribution, Erika tool registry, DiveM Personal access boundary |
| `DELETE/DEFER` | dead overlapping Persona screens after reachability proof; temporary TDD branches/PRs after containment; Creative Router, dynamic juror selection, provider diversity, automatic OAuth publishing, face-aware/artistic editing, advanced Court calibration, DiveM Classic integration |

Issue #86 remains the source of truth for software-development automation. Its security, data-corruption, PWA update, mobile E2E, and truthful production-verification findings remain valid prerequisites for trusted production work. Its queue is not copied into Product Orchestrator state.

### 13.2 Delivery focus

#### A. Shortest path to the first real Persona publication

Use one canonical idea/brief/result/asset, the accepted V1.1 processor, deterministic QA, one small Level 2 Court at the public-content decision, a single `Take / Change / Reject` gate, assisted manual upload, publication ledger, and a first metric snapshot. Complete Life OS recovery and OAuth publishing are not prerequisites.

#### B. Minimum changes for Decision Court v0

1. Add `DecisionCase`, proposal revision, evidence audit, juror verdict, Judge decision, execution link, and outcome evaluation contracts.
2. Persist them through the existing versioned runtime/audit substrate.
3. Implement hard Level 3 rules and deterministic Level 0/1/2 gating.
4. Add provider-neutral role adapters and a static registry for Persona and software decisions.
5. Run Advocate and Challenger from the same frozen proposal/context.
6. Require Evidence Auditor classification before judging.
7. Collect three independent jurors for the first Persona case.
8. Allow at most two autonomous revisions.
9. Issue an exact-revision execution authorization and link it to the domain action group.
10. Record actual publication outcome and basic cost/latency metrics.

Court v0 needs no new user-facing screen, dynamic weighting, multi-provider routing, or general self-modifying agent framework.

#### C. Court capabilities deferred until real outcomes exist

- learned juror reliability weights;
- model/provider diversity policies;
- automatic jury composition beyond a static decision registry;
- causal claims about which juror caused better results;
- cross-user or DiveM Classic calibration;
- automatic modification of thresholds or safety constraints;
- full Court transcripts in the normal user experience;
- full Court for ordinary Life OS scheduling and technical media operations.

### 13.3 Next ten implementation steps

1. Make the reviewed recovery head the single non-`main` integration base and record donor refs; do not merge divergent branches wholesale.
2. Close the issue #86 security/data-integrity blockers required for trusted production state, while keeping scheduler/credential blockers scoped.
3. Commit the canonical ownership, entity, event, correlation, asset, publication, and decision contracts.
4. Implement Decision Court v0 persistence and Level 0–3 gate on the existing runtime/audit substrate.
5. Consolidate Persona idea, brief, shooting result, and history into canonical records with an idempotent browser-state migration.
6. Repair the real production shooting-brief flow and persist a valid revisioned brief.
7. Transplant the isolated V1.1 Video Engine package/tests and connect it through the canonical MediaAsset/ProcessingRun bridge.
8. Add deterministic prepublish filters plus the small Persona Court with bounded autonomous `REVISE`.
9. Present one final `Take / Change / Reject` decision and record an assisted real publication with Observer evidence.
10. Capture the first metric snapshots, evaluate the originating Court decision, and decide from measured lift whether Court use should expand.

## 14. Shortest path to first real publication

The first publication does not need complete Life OS, OAuth publishing, a Creative Router, face tracking, or artistic AI editing.

Use this path:

```text
persist one Persona idea
  -> run a small evidence-audited Court for the significant concept
  -> produce and persist a valid shooting brief
  -> attach the existing real iPhone video as immutable MediaAsset
  -> run Persona Video V1.1 locally
  -> persist verified clean/captioned/Instagram artifact refs
  -> create one candidate revision
  -> run deterministic QA and the bounded prepublish Court
  -> resolve REVISE autonomously within budget
  -> user chooses Take / Change / Reject
  -> user performs final Instagram upload if OAuth is absent
  -> record external URL/ID and publication timestamp
  -> capture first metric snapshots
  -> generate one evidence-backed learning observation
```

This is the shortest honest route from real life to published media and measurable learning. It reuses the accepted real-video engine, spends Court cost only on the concept/publication decisions, and keeps the only unavoidable manual step at the external account boundary.

## 15. Final answers

1. **Wrong now:** duplicated goals, Persona state, memory, analytics, and orchestration; browser-owned production lifecycle; product and development supervisors conflated; significant autonomous choices have no shared evidence-audited decision record; too many module-shaped UI surfaces.
2. **Preserve:** runtime/offline/audit/undo substrate, Supabase Edge + Render, provider-neutral adapters, Media Brain provenance/jobs, Persona publication contracts, V1.1 video engine, issue #86 verification discipline, and reusable role/state-machine patterns for bounded deliberation.
3. **Combine:** Media Brain + Content Factory + Video Engine + distribution under Persona; all life goals under Life OS; memory and observations in one canonical ledger with domain projections.
4. **Delete/do not build:** separate Shared Brain app, separate Erika store, new duplicate schemas/screens, Vercel runtime, undocumented CapCut coupling, Creative Router and heavy provider integrations before first publication; archive temporary branches after containment proof.
5. **Missing:** canonical ownership/event/correlation contracts, durable product jobs, Decision Court records and exact-revision authorization, canonical asset/publication lineage, outcome-linked calibration, metrics attribution, Erika tool registry/memory, DiveM privacy/tenant boundary, and one real publish E2E.
6. **Final ownership:** Life OS owns life facts; Erika owns conversation; Product Orchestrator owns execution coordination and Decision Court gating; Persona owns media lifecycle/distribution; DiveM Personal owns private assessments; DiveM Classic is separately tenanted; Shared Brain provides the canonical decision/entity/event/memory/observation ledger and projections without becoming a product.
7. **Optimal order:** establish one integration line → canonical ownership and decision contracts → Court v0 persistence/gating → durable Persona state → shooting fix → transplant V1.1 → bounded prepublish Court and publication ledger → metrics/outcome calibration → reliability → Erika/Life completion → optional providers and DiveM expansion.
8. **Shortest publication path:** canonical idea/brief/result/asset → existing local V1.1 processing → deterministic QA plus a small Level 2 Court only for the significant public-content choice → bounded autonomous revision → `Take / Change / Reject` → assisted manual upload → publication record → metrics snapshot → outcome-linked learning.
