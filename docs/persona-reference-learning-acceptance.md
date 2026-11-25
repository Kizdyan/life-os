# Persona reference learning and quality gates (proposed, not implemented)

Goal: automate the media-to-publication loop while preserving human creative approval and measurable quality. Reuse existing workers, review contracts and render paths before adding new services. This is an acceptance specification, not a claim of deployed capabilities.

## P0 — durable ingestion and reference evidence
- Read-only ingestion, content hashes, stable asset IDs, incremental sync, explicit errors, retry/backoff, cancellation and resume. Never delete source media. Local-only private URLs, media, annotations and preference data; never commit or log them.
- Separate technical properties, observed artistic features, inferred interpretations and explicitly approved preferences. A reference is not blanket approval. Store time ranges, evidence pointers, confidence, model/version and provenance for each feature.
- Analyze video across detected shots, speech and audio; separate subtitles from watermarks and graphics. Extract shot lengths, framing, lighting, color, typography, pacing, music, sound design, hook and narrative role. Do not infer unavailable data as fact.
- Every item has queued/running/succeeded/failed state; persist atomically per item, show actual successful and failed counts, heartbeat, current item and measured throughput. Estimate remaining time only after sufficient observations. Restart without reprocessing valid results. Background operation only via explicitly configured local worker; do not claim it is running when it is not.

## P0 — candidate tools, evaluate before integration
- https://github.com/mlfoundations/open_clip : pretrained image/text embeddings and retrieval.
- https://github.com/facebookresearch/dinov2 : pretrained visual features, candidate for similarity and grouping.
- https://github.com/voxel51/fiftyone and https://github.com/voxel51/fiftyone-skills : dataset curation and duplicate analysis; use only if integration cost is justified.
- https://github.com/Breakthrough/PySceneDetect : shot boundaries.
- https://github.com/SYSTRAN/faster-whisper : speech transcription; benchmark against existing Whisper path.
- https://github.com/LAION-AI/aesthetic-predictor : population-level aesthetic prior, never personal taste or sole gate.
- https://github.com/chaofengc/IQA-PyTorch : evaluation candidate only; noncommercial license is a blocker for commercial use unless separately cleared.
- https://github.com/huggingface/setfit : optional text preference classification once labeled evidence is sufficient; not image-model fine-tuning.
- https://github.com/remotion-dev/remotion : candidate deterministic rendering where existing renderer falls short.

Audit code and weight licenses separately, pinned versions, supply-chain risks, hardware support, memory, speed and quality. No blanket install, unsafe checkpoint deserialization or execution of untrusted agent skills. Existing FFmpeg and worker are baseline. Test a lightweight CPU-compatible path; expensive models only for difficult cases. Select by measured quality/cost, not popularity.

## P0 — preference learning
- Append-only feedback events: asset/revision ID, task, dimension, decision (approve/reject/partial/uncertain), reason, evidence, scope, timestamp, source. Never turn an AI guess into user approval. Preserve conflicting judgments and superseded rules.
- Retrieve relevant approved examples and counterexamples per task, separately from general reference features. Build a versioned preference profile. Start with retrieval and transparent ranking; evaluate small supervised ranker/classifier only after adequate diverse labeled examples. No mandatory fine-tuning or autonomous weight updates.
- Maintain distinct technical quality, artistic preference, suitability to purpose and audience signals. Engagement cannot override accuracy, rights or explicit creative constraints.
- Compare baseline and candidate against a frozen, consented, locally stored evaluation set with no near-duplicate leakage. Record pairwise agreement, retrieval relevance, false rejection, failure rates, speed and reviewer disagreement. Establish thresholds before evaluation; reject regressions and allow rollback.

## P0 — publication acceptance
- Independent review against selected references, explicit brief, source facts, visual hierarchy, readability, composition, color, sound, cut rhythm, platform safe areas, rights and delivery specs.
- Technical checks on actual rendered outputs (not only manifests or screenshots). Fail or abstain when evidence is missing; bounded revision loop with clear failure reasons.
- User sees creative alternatives and finished preview; no manual technical monitoring. Publish only after explicit approval and permitted platform access; idempotency and delivery receipts.

## Delivery order
1. Integrate and prove resumable ingestion and local review.
2. Benchmark reference extraction and similarity on representative local samples.
3. Persist preference events and retrieve them at creation time.
4. Connect independent quality gates to actual renders; demonstrate before/after on at least two content briefs.
5. Enable scheduled local worker and approved publishing; prove interruption recovery and end-to-end acceptance.

Do not mark complete until actual local runs, retained outputs, negative tests and independent creative acceptance are available. Keep existing features and main branch unchanged until review.
