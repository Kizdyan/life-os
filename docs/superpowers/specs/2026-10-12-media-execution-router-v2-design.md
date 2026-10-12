# Media Execution Router V2 + Content Format Contract

## Status and scope

This design starts from accepted Desktop Media Processing V1 commit
`5ce22718b4a0ccdbd5d4856baae8c291e527bff5`. The original V1.1 engine at
`646f0708508c0fc603a43c555b771efe1176ee14` remains immutable. V1 stays a
validated Desktop Executor adapter; it is not the V2 source of truth.

The first implementation slice is domain-only and deterministic. It proves:

`ContentItem -> format inference -> canonical timeline -> safe composition -> executor routing -> QA decision`

It does not implement remote transport, iOS rendering, cloud rendering,
publishing, or a new UI.

## Architectural choice

V2 uses a canonical orchestration contract with executor adapters. Publication
intent and editorial decisions live above renderers. Executors receive a frozen
execution request and return evidence; they cannot change the publication type
or timeline. This preserves working V1 components while allowing desktop,
iPhone, cloud, and future third-party renderers to compete by capability.

Alternatives rejected for this slice:

- Extending the V1 desktop job as the central V2 model would retain the LAN,
  video-only, and Instagram-specific assumptions.
- Creating separate format-specific pipelines would duplicate lineage,
  scheduling, approval, and publishing rules.
- Letting each renderer infer format would make output depend on executor
  choice and silently change editorial intent.

## Canonical Content Format Contract

`CanonicalContentItem` is an immutable, versioned publication-intent snapshot.
Idea creation, capture, and later approved changes create a new revision rather
than mutating the earlier snapshot. It carries:

- `contentItemId`
- `targetPublicationType`: `reel | photo_post | carousel_post | story`, with
  future extension through versioned migration rather than unvalidated strings
- `targetPlatforms`
- planned source kinds before capture and immutable captured `sourceAssets`
  referencing existing `MediaAsset.id` values
- approved idea ID and version
- shooting session ID
- publication objective
- scheduled publication time, priority, and deadline
- canonical composition, audio, and subtitle intent
- caption/copy linkage
- publication status
- provenance describing whether format came from editorial intent or inference

Each captured source uses a validated `AssetDescriptor` snapshot containing
kind, hash, bytes, dimensions, rotation, codec, and MIME type. Missing or null
metadata fails closed before routing. A text/design slide is a typed kind, not
inferred from a filename.

Every downstream V2 record pins `contentItemId`, content-item revision/hash,
`targetPublicationType`, approved idea/version, source asset IDs/hashes,
timeline version/hash, and QA policy version. Constructors validate equality.
A renderer response with different lineage or type is invalid rather than
silently accepted.

Content revision and timeline hashes are derived from canonical serialization
of their immutable payloads with SHA-256. Caller-supplied expected hashes are
verification assertions; they are never accepted as the identity source.

### Inference

Explicit approved editorial intent always wins. Without it:

1. Any video source -> `reel`.
2. Exactly one photo -> `photo_post`.
3. Multiple photos -> `carousel_post`.
4. A text/design-carousel source -> `carousel_post`.
5. `story` requires explicit intent; it is never inferred merely from a
   vertical aspect ratio.

Mixed unsupported inputs and incomplete asset descriptors fail closed with a
reason instead of guessing. Before capture, approved editorial intent or typed
planned-source kinds establish the type; capture adds asset descriptors in a
new content-item revision while preserving that type.

## Canonical timeline / edit specification

`CanonicalMediaTimeline` is renderer-neutral and versioned. It is a
discriminated union of `video_timeline`, `photo_plan`, and `carousel_plan`, so
video-only fields cannot leak into photo or slide work. Video time uses integer
milliseconds; geometry uses normalized source coordinates after rotation and
SAR normalization. Every plan defines canvas/DAR, ordered layers, safe-zone
coordinates, color intent, and output intent. Video plans additionally include
source references, ordered clips, in/out points, speed, transitions,
reframe/scale/position, overlays/subtitles, audio/music/loudness, and target
duration. Carousel plans define ordered slide plans and per-slide composition.

The first slice creates a minimal valid timeline for the inferred publication
type. Later editorial selection can replace its tracks without changing the
contract. Render attempts reference a timeline version and hash; renderer
failure never mutates or deletes the timeline.

Video composition modes are:

- `subject_reframe`
- `animated_reframe`
- `contain_background`
- `crop`
- `layout_composite`

Square or horizontal video intended as a Reel defaults to
`contain_background` unless an upstream composition decision explicitly
provides a crop region and confidence that satisfies policy. The V1 behavior
that discarded 43.75% of a square frame is therefore not reproduced.
Composition requirements remain per clip; routing requires every clip mode
rather than treating a synthetic aggregate layout label as sufficient.

Photo posts and carousels use still-image/slide instructions and never route
through a video-only renderer. Story remains a distinct output intent with its
own safe zones.

## Quality and crop policy

Deterministic preflight returns:

- `CROP_SAFE`
- `CROP_REVIEW_REQUIRED`
- `QUALITY_PASS`
- `QUALITY_DEGRADED`
- `OUTPUT_INVALID`

Default crop policy allows at most 20% discard on either source axis and 30%
source area discard without an explicit composition decision. Discard is
calculated after rotation and SAR normalization. A larger crop needs an
explicit normalized crop ROI plus versioned evidence from a named producer
with confidence >= 0.90; otherwise execution is blocked for composition
revision. Missing subject evidence cannot produce `CROP_SAFE`, and subject or
safe-zone clipping evidence always blocks regardless of confidence.

Quality intent prefers one final encode. Technically identical platform
variants use stream copy. Upscaling is never treated as added detail; source
resolution, output resolution, codec/profile, FPS, bitrate, audio, generation
count, duration, full decode, crop percentage, and lineage are QA evidence.
The first slice models these requirements and preflight decisions; post-render
measurement arrives with executor adapters.

Preflight chooses a lower platform-aspect canvas when the source cannot fill
the nominal 1080x1920 canvas without upscaling. Outputs below the configured
minimum useful resolution and Reel/Story timelines outside platform duration
bounds are non-actionable. Crop ROIs must be normalized, in bounds, and match
the target display aspect ratio; discard is measured from the exact persisted
ROI.

## Executor contract and routing

`ExecutorCapabilities` declares executor kind, supported publication types,
input decode codecs, output encode codecs, aggregate/per-asset size and
resolution limits, exact composition modes, maximum encode generations,
availability, locality, expected completion time, estimated cost, quality
tier, and semantic features such as subtitles/audio/slide layout. Availability
snapshots contain `observedAt`, `expiresAt`, and heartbeat evidence; stale
executors are ineligible.

`MediaExecutor` later exposes claim/heartbeat/execute/cancel/result operations.
The first slice implements deterministic capability routing over snapshots.

Candidates must first satisfy semantic fidelity, minimum quality, format,
composition, codec, size, resolution, freshness, and deadline constraints.
Ranking then uses:

1. owned/local or zero-cost execution
2. free-tier execution
3. paid cloud only when a typed bounded-paid policy explicitly permits it
4. higher quality tier
5. completion before deadline, then earliest completion

Ties resolve by stable executor ID. Selection returns a non-actionable
`selected_pending_claim` decision until an atomic lease claim succeeds; claim
failure triggers deterministic rerouting over a fresh snapshot.

The default budget policy is typed `FREE_ONLY`. The user does not choose
routine infrastructure. If no candidate qualifies,
the router returns a typed non-actionable decision; it never silently degrades
an approved content item.

## Remote Desktop Executor target

Desktop V1 becomes an outbound executor adapter:

`remote queue/storage -> claim lease -> download source -> render -> upload result/evidence -> complete lease`

It requires heartbeat, expiry, crash recovery, exact attempt ownership,
idempotency, resume, and no inbound public port. An unavailable desktop is
excluded from routing and does not block other executors.

## Deadline and publication policy

Rendering and publishing are independent. Configurable checkpoints default to:

- T-24h: normal preparation
- T-6h: priority escalation or compatible executor failover
- T-1h: validated master required or approved fallback strategy activated
- publication time: publisher uses an already approved, independently stored
  platform variant

Fallback may select another compatible executor, a simpler pre-approved edit,
approved backup content, or an editorially approved alternate format. It may
not materially change publication type or content without approval.

The Publisher consumes validated platform variants from shared storage and is
independent of the rendering device. CapCut and other editors remain optional
adapters.

## Decision Court and QA

Completion of a renderer is not readiness. Before `ready`, deterministic media
validation, format compliance, crop/composition checks, quality checks,
editorial consistency, platform compliance, independent critic, and any
required adversarial review must pass. Degraded or unverified output remains
non-actionable.

## Migration from V1

1. Leave the frozen V1 branch and V1.1 worktree unchanged.
2. Map existing MediaAsset IDs, idea versions, shooting sessions, attempts,
   manifests, hashes, and review state into V2 references.
3. Wrap the current V1 worker as `desktop-v1` with its exact video-only,
   fixed-9:16, center-crop and multi-generation guarantees. It is ineligible
   for square/horizontal Reel jobs requiring `contain_background`, one-encode
   quality, or another unsupported composition mode.
4. Route only compatible V2 execution requests to that adapter.
5. Keep existing local/LAN acceptance available during migration; introduce
   remote queue/storage behind a new adapter boundary.
6. Move publication to shared ready-master storage before removing any local
   path.

V2 execution identity is independent from V1 `job-${assetId}`. Its idempotency
key includes content item ID, content revision/hash, timeline hash, and output
profile derived from the canonical plan; attempt ownership is a separate
field. Reusing one asset in multiple
content items therefore cannot collide. Frozen V1 identity is not retrofitted.

## First vertical slice

Create a focused core module that:

- builds and validates `CanonicalContentItem`
- applies the five format-inference examples
- creates a minimal renderer-neutral timeline
- chooses a safe composition strategy for video
- routes to one compatible executor under FREE_ONLY by default
- returns a format-aware QA decision
- proves publication type invariance across every produced record
- creates distinct execution identities for distinct content/timeline snapshots

Tests cover video, one photo, multiple photos, text carousel, explicit Reel
from photos, square-video safe composition, destructive-crop rejection,
unavailable desktop failover, paid-cloud exclusion, no compatible executor,
publication-type drift rejection, incomplete descriptor rejection, stale
executor exclusion, deterministic tie-breaking, V1 capability rejection,
crop boundary/rotation cases, malformed cross-format plans, and revision/hash
lineage preservation.

The first slice models approval binding as a contract: approval references the
exact master hash, content/timeline lineage, and QA policy version. Actual
publication remains deferred. Decision Court has a deterministic/local critic
baseline; paid AI critique is optional enhancement only.

## Deferred work

- shared remote queue/storage and executor protocol
- Desktop Remote Executor implementation
- native iPhone execution adapter
- cloud executor adapters and bounded budget integration
- post-render objective quality analyzer
- Publisher and platform adapters
- deadline scheduler/runtime integration
- UI copy/state migration
- physical large-video Safari chunk/resume/quota follow-up from V1

