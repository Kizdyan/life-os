# Media Execution Router V2 — First Vertical Slice Implementation Plan

> **For Codex:** Execute each task with test-driven development: add the stated failing tests, run them to observe the intended failure, implement only the required behavior, verify, and commit before starting the next task.

**Goal:** Prove a deterministic, provider-neutral path from a versioned ContentItem through publication-type inference, canonical edit intent, safe composition, capability routing, and format-aware QA without changing frozen V1.

**Architecture:** New V2 contracts live beside the existing media pipeline. They reference existing MediaAsset identity but use validated descriptor snapshots and independent V2 lineage. Discriminated timeline plans prevent a still/carousel from entering a video renderer. The router filters hard constraints first, defaults to `FREE_ONLY`, and ranks eligible executors deterministically.

**Tech Stack:** TypeScript 5.9, Vitest 3, existing `packages/core` barrel exports.

---

## Task 1: Canonical Content Format Contract

**Files:**
- Create: `packages/core/src/content-format-v2.ts`
- Create: `packages/core/src/content-format-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**RED tests:**
- Video with no explicit intent infers `reel`.
- One photo infers `photo_post`.
- Multiple photos and text slides infer `carousel_post`.
- Explicit Reel intent overrides a photo-only source set.
- Incomplete captured descriptors fail closed.
- Adding captured assets creates a new revision while preserving explicit publication type and idea/version lineage.

**Implementation:**
- Add versioned content-item, source-descriptor, intent, scheduling, caption/copy, and publication-state types.
- Add validated constructors and inference with explicit editorial intent precedence.
- Export the module through the core barrel.

**Verification:** targeted Vitest file, TypeScript typecheck, commit.

## Task 2: Canonical Timeline, Composition, and Preflight QA

**Files:**
- Create: `packages/core/src/canonical-media-timeline-v2.ts`
- Create: `packages/core/src/canonical-media-timeline-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**RED tests:**
- Reel produces a video timeline; photo and carousel produce their dedicated plan kinds.
- Cross-format or publication-type drift is rejected.
- Square Reel input selects `contain_background` and reports zero destructive crop.
- Blind square-to-9:16 crop measures 43.75% horizontal discard and is blocked without evidence.
- Crop threshold boundaries, rotation normalization, and subject-clipping evidence are enforced.
- Timeline lineage pins content revision/hash, idea/version, sources, and QA policy.

**Implementation:**
- Add discriminated renderer-neutral plan contracts with normalized geometry and integer millisecond video timing.
- Add deterministic canvas/profile selection and crop measurement.
- Add safe composition selection and `CROP_SAFE | CROP_REVIEW_REQUIRED` preflight.
- Add output-quality intent that caps encode generations and forbids quality claims from upscaling.

**Verification:** targeted Vitest files, TypeScript typecheck, commit.

## Task 3: Executor Capabilities, Routing, and V2 Execution Identity

**Files:**
- Create: `packages/core/src/media-execution-router-v2.ts`
- Create: `packages/core/src/media-execution-router-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**RED tests:**
- FREE_ONLY excludes paid cloud and picks a compatible owned executor.
- Stale or unavailable executors are excluded.
- Equal candidates resolve by stable executor ID.
- Desktop V1 capability is rejected for a square Reel requiring contain-background and one final encode.
- An unavailable desktop fails over to another compatible executor.
- No eligible executor returns a typed non-actionable result.
- Same MediaAsset used by different content/timeline revisions produces distinct execution IDs.
- Stale/wrong-lineage executor results and approvals are rejected.

**Implementation:**
- Add executor snapshot/capability, budget, routing-decision, lease-request, result-lineage, and approval contracts.
- Filter semantic, format, codec, size, resolution, freshness, composition, generation, deadline, and budget constraints before ranking.
- Add deterministic ranking and execution identity.
- Add a truthful, narrow Desktop V1 capability helper.

**Verification:** targeted Vitest files, TypeScript typecheck, commit.

## Task 4: End-to-End Vertical Orchestration and Local Acceptance

**Files:**
- Create: `packages/core/src/media-execution-v2.ts`
- Create: `packages/core/src/media-execution-v2.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `docs/superpowers/specs/2026-10-12-media-execution-router-v2-design.md` only if implementation reveals a contract correction.

**RED tests:**
- Each required inference example reaches the expected timeline and compatible executor.
- Explicit photo-to-Reel reaches a video timeline without changing approved type.
- Square source reaches a safe composition and never routes to Desktop V1.
- A degraded/unverified path is non-actionable.
- Publication type and lineage remain invariant across the full prepared request.

**Implementation:**
- Compose content validation, timeline construction, QA preflight, routing, and frozen execution request creation.
- Return typed `READY_FOR_EXECUTION`, `REVISE_COMPOSITION`, or `NO_EXECUTOR` decisions.
- Keep remote transport, renderer execution, publishing, and UI outside this slice.

**Verification:**
- Targeted V2 tests.
- Full `pnpm test` regression.
- `pnpm typecheck`.
- `pnpm api:typecheck`.
- `pnpm web:build`.
- `git diff --check` and frozen V1 HEAD/worktree integrity check.
- Independent final contract/QA review, then atomic commit.

## Deferred implementation packets

- Desktop Remote Executor: shared queue/storage, outbound claim, lease/heartbeat, downloads/uploads, recovery, and remote evidence.
- iPhone Executor: eligibility/capability adapter for bounded native edits and durable background constraints.
- Cloud Executor: replaceable provider adapter plus explicit bounded budget/deadline policy.
- Publisher: shared ready-master storage, exact-hash approval binding, platform variants, scheduling, and failsafe content.
- V1 physical follow-up: large-video Safari chunk/resume/quota remains separately deferred.

---

## Continuation: autonomous multi-executor proof

The first four tasks proved format inference and pre-execution routing. The
continuation keeps those contracts and adds the minimum stateful execution
slice required to prove that one logical job survives executor failure without
allowing a stale attempt to win.

### Task 5: Close content-input validation gaps

**Files:**
- Modify: `packages/core/src/content-format-v2.test.ts`
- Modify: `packages/core/src/content-format-v2.ts`

**RED tests:**
- Unknown or empty `plannedSourceKinds` fail closed before they can influence
  format inference or revision identity.

**Implementation:**
- Validate every planned source kind at the canonical content boundary.

**Verification:** targeted Vitest file, commit.

### Task 6: Durable execution job and lease state machine

**Files:**
- Create: `packages/core/src/media-execution-job-v2.ts`
- Create: `packages/core/src/media-execution-job-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**RED tests:**
- A stable logical job creates monotonically numbered attempts.
- Only one unexpired lease may own the current attempt.
- Heartbeats extend only the matching active lease.
- Lease expiry makes the attempt recoverable without changing the logical job.
- A stale attempt cannot validate or promote a result after failover.
- Duplicate completion is idempotent for the same immutable result and rejects
  conflicting results.
- A serialized snapshot restores safely after orchestrator restart.

**Implementation:**
- Add immutable `MediaExecutionJobV2`, `ExecutionAttemptV2`, `ExecutorLeaseV2`,
  `RenderedAssetV2`, and `QualityResultV2` contracts.
- Add pure transition functions driven by caller-supplied timestamps. No sleeps,
  ambient clock, storage implementation, or network transport in this slice.

**Verification:** targeted Vitest file, TypeScript, commit.

### Task 7: Executor interface and deterministic adapters

**Files:**
- Create: `packages/core/src/media-executor-v2.ts`
- Create: `packages/core/src/media-executor-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**RED tests:**
- The typed executor lifecycle exposes claim, execute, heartbeat, validate,
  cancel, and release/fail operations.
- Desktop V1 adapter rejects plans outside the frozen V1 capability envelope.
- The deterministic alternate executor returns lineage-bound output evidence.
- Invalid/corrupt output fails objective validation.

**Implementation:**
- Define provider-neutral executor commands/results and two deterministic
  adapters: a narrow Desktop V1 contract adapter and an in-memory alternate
  executor used to prove failover. Do not invoke or modify frozen V1.

**Verification:** targeted Vitest file, TypeScript, commit.

### Task 8: Autonomous failover orchestrator

**Files:**
- Create: `packages/core/src/media-execution-orchestrator-v2.ts`
- Create: `packages/core/src/media-execution-orchestrator-v2.test.ts`
- Modify: `packages/core/src/index.ts`

**RED tests:**
- Unavailable Desktop at creation routes to the alternate executor.
- Desktop claim failure selects the next compatible executor.
- Lost heartbeat expires the lease and starts one newer attempt.
- A stale Desktop result arriving after failover cannot win.
- Invalid output triggers bounded failover; no executor loops forever.
- Executor race yields one READY master and rejects duplicate/conflicting
  completion.
- Deadline escalation skips a path that cannot finish in time while FREE_ONLY
  remains the default when time permits.
- Restart from a durable snapshot resumes recovery deterministically.
- No capable executor ends in a typed non-ready state.

**Implementation:**
- Compose existing capability routing with the pure job state machine and
  injected executors. Persist candidate/rejection/failure evidence in the job.
- Bound attempts by policy and require deterministic timestamps from the caller.
- Promote exactly one validated immutable master.

**Verification:** targeted tests, all V2 tests, commit.

### Task 9: Review and branch verification

**Verification:**
- Full repository regression.
- Application and API TypeScript checks.
- Production Vite build.
- `git diff --check`.
- Frozen V1 and immutable V1.1 HEAD/clean checks.
- Independent contract review and adversarial race review; Critical and
  Important findings receive RED-to-GREEN fixes before the final commit.
