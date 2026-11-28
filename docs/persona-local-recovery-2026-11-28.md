# Local intelligence and Persona integration checkpoint — 2026-11-28

This isolated version starts at #228 (`200cc79d`) and preserves reviewed #229–232 histories. Main and original media were not modified. No publication, author approval, paid inference or account changes were performed. Cream Editorial remains the approved current style; legacy creative work stays separate.

## Implemented and actually exercised

- Imported scoped Instagram/TikTok observation envelopes into the existing analytics store, with canonical identity, null versus zero, history and deduplication. Partial/corrupt metric objects are rejected. Damaged browser storage is reported immediately and retained byte-for-byte.
- Mobile Chromium exercised real scoped observation imports, reload, duplicate import and damaged storage: five checks passed with no page errors. Private account data and screenshots are outside Git. Connector observations are not proof of autonomous local app authorization, public TikTok visibility, or 24/48/72-hour cohorts. An unknown publication timestamp stays null.
- Existing launcher checks a running Worker's captured source identity before reusing it. Different, dirty or unknown source identity refuses reuse without killing the old service. This is a source check, not cryptographic attestation of dependencies/build output.
- Final Quick Render cards and full-quality promotion wait for atomic card commit. A further actual Windows regression exposed the same race for failures and subprocess-session settlement: the canonical terminal record could be visible while its writer still held a lock. Regressions hold that boundary deliberately; a live session now waits for its owning callback/card save. Restart recovery still trusts the durable ProductionJob.
- Scheduled retry fixture now waits for the queue owner to release its resources before replacing the Worker; its child timeout does not promise that Windows/USB setup finishes in three seconds. Source preservation and the two-attempt limit remain asserted.
- Night commands reuse the existing dispatcher, journal, executor and ProductionJob mutex. Actual first launch executed one allowlisted engineering test. Restart executed zero duplicate tasks; STOP executed zero tasks and left the board unchanged. This is controlled recovery evidence, **not overnight certification**.

## Validation evidence at this checkpoint

| Check | Result |
| --- | --- |
| Complete web/unit suite | 774 passed before the subsequent JS-only render settlement fix |
| Three TypeScript checks and Vite build | Passed; existing large-chunk warning only |
| Mobile observation import/reload/dedupe/corruption | 5 passed |
| Night/status/runtime focused suite | 13 passed |
| Actual Worker session + scheduled production regression files | 14 passed after the settlement fixes |
| Earlier complete media run | 442 passed, 2 failed, 5 skipped; both causes investigated, full repeat pending |

The media failure reports are retained. Do not label the whole current head green until its full repeat/CI completes. Synthetic media validates contracts and technical processing, never artistic quality.

## Installed local model: measured, not promoted

Qwen3.6 `27b-q4_K_M` is installed once in a separate model store. Actual allocation trials passed 4096, 8192, 16384, 32768 and 65536 tokens. At 65536 the runtime reported about 21.51 GB total and 5.86 GB in VRAM; free RAM after the request was about 9.05 GB. This verifies allocation, not long-context reasoning accuracy or Hermes end-to-end tool execution.

The roughly 11–12 minute cold start coincides with the runtime's `compat patch disabled mmap for transformed text tensors` and reading 17.42 GB from an external USB disk (one measured sample: 29.83 MB/s). This is evidence for a substantial I/O/compatibility cost, not proof that all delay is disk alone. Pagefile is system-managed on a different drive; no pagefile/power settings were changed. Cache/file reads must not be misreported as pagefile thrashing.

The isolated server uses verified 65536 default context, one loaded model, one request at a time, local-only mode and a 30-minute idle retention window. Actual warm-retention and intellectual tests are in progress. Existing compact models and the original Ollama endpoint are preserved. Hermes was installed from official pinned stable source; optional messaging plugins, cloud fallback and lazy installs are disabled for the limited memory-only trial. Installation is not proof of agent qualification.

## Remaining boundaries

- No autonomous publisher or public-visibility confirmation has been proven. Keep #231's separate provider receipt / visibility states and no-blind-retry policy.
- Local analytics polling lacks separately established app authorization; connector handoff is explicit and scoped.
- Local model quality, actual Hermes tools/memory/restart and AI Capacity registration require their own measured acceptance. Do not promote Qwen solely because a large context allocates.
- Night reference/research/content/analytics adapters are not implemented by task labels. Unsupported goals explicitly block and independent engineering continues. No automatic queue refill, unattended full-content production or overnight stability is claimed.
- Hardware temperatures are unavailable through the inspected interface. No thermal PASS is inferred.

See [night commands](persona-local-night-mode.md), [runtime contract](persona-unified-runtime.md), [current editorial style](persona-approved-editorial-style-2026-11-27.md), and [delivery incident](persona-delivery-incident-2026-11-27.md).
