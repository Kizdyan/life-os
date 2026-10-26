/**
 * Evidence-first export QA for Persona video pipeline. Nothing is inferred.
 * Metrics must be supplied by real media inspection; subjective properties
 * require human approval. This module does NOT auto-publish a video.
 */
export interface MediaExportEvidence {
  measuredFromRenderedFile: boolean;
  outputSha256: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  durationSeconds: number | null;
  hasAudio: boolean | null;
  integratedLufs: number | null;
  truePeakDbfs: number | null;
  captionSyncP95Ms: number | null;
  captionsRequired: boolean;
  renderErrors: number | null;
  blackOrFrozenFrames: number | null;
  visibleArtifacts: number | null;
  identityPreserved: boolean | null;
  paletteApproved: boolean | null;
  mediaRightsCleared: boolean | null;
}
export interface MediaExportQaResult {
  status: "pass" | "review_required" | "fail";
  blockers: string[];
  pending: string[];
  verified: boolean;
}
const SHA256 = /^[a-f0-9]{64}$/i;
const isPositive = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;
const knownNonnegativeInt = (n: number | null): n is number =>
  n !== null && Number.isSafeInteger(n) && n >= 0;
/** Baseline quality gates for a 9:16 short, not claims about a platform's rules. */
export function assessPersonaReelExport(e: MediaExportEvidence): MediaExportQaResult {
  const blockers: string[] = [];
  const pending: string[] = [];
  if (!e.measuredFromRenderedFile || !e.outputSha256 || !SHA256.test(e.outputSha256)) {
    pending.push("Rendered-file measurement and SHA-256 required");
  }
  if (!isPositive(e.width) || !isPositive(e.height) || !isPositive(e.fps) ||
      !isPositive(e.durationSeconds)) {
    pending.push("Real resolution, fps and duration required");
  } else {
    if (e.width < 720 || e.height < 1280) blockers.push("Export resolution below 720x1280");
    if (Math.abs(e.width / e.height - 9 / 16) > 0.025) blockers.push("Not a 9:16 reel");
    if (e.fps < 24) blockers.push("Framerate below 24 fps");
    if (e.durationSeconds < 3 || e.durationSeconds > 180) blockers.push("Unsupported reel duration");
  }
  if (e.hasAudio === null) pending.push("Audio presence not measured");
  else if (!e.hasAudio) blockers.push("Audio track missing");
  else if (e.integratedLufs === null || e.truePeakDbfs === null ||
           !Number.isFinite(e.integratedLufs) || !Number.isFinite(e.truePeakDbfs)) {
    pending.push("Audio loudness and true peak not measured");
  } else {
    if (e.integratedLufs < -22 || e.integratedLufs > -10)
      blockers.push("Audio loudness outside -22 to -10 LUFS quality range");
    if (e.truePeakDbfs > -1 || e.truePeakDbfs < -60)
      blockers.push("Audio true peak out of allowed range");
  }
  if (e.captionsRequired) {
    if (e.captionSyncP95Ms === null || !Number.isFinite(e.captionSyncP95Ms) ||
        e.captionSyncP95Ms < 0) pending.push("Subtitle timing must be measured");
    else if (e.captionSyncP95Ms > 120) blockers.push("Subtitle sync p95 exceeds 120ms");
  }
  for (const [label, count] of [
    ["render errors", e.renderErrors],
    ["black/frozen frames", e.blackOrFrozenFrames],
    ["visible artifacts", e.visibleArtifacts],
  ] as const) {
    if (!knownNonnegativeInt(count)) pending.push(`${label} not measured`);
    else if (count > 0) blockers.push(`${label} detected: ${count}`);
  }
  for (const [label, approval] of [
    ["identity preservation", e.identityPreserved],
    ["visual palette", e.paletteApproved],
    ["asset rights", e.mediaRightsCleared],
  ] as const) {
    if (approval === null) pending.push(`Review required: ${label}`);
    else if (!approval) blockers.push(`Review failed: ${label}`);
  }
  return {
    status: blockers.length ? "fail" : pending.length ? "review_required" : "pass",
    blockers, pending,
    verified: blockers.length === 0 && pending.length === 0,
  };
}