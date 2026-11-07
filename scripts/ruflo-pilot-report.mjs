#!/usr/bin/env node
/** Offline, read-only pilot evaluator. Node.js 22.16+ for TS stripping. */
import { readFile, lstat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { assessRufloPilotRequest, evaluateRufloAgainstBaseline } from '../packages/core/src/ruflo-pilot.ts';

/** Verify actual bytes, not self-reported SHA-256 strings from agent-generated JSON. */
async function digestArtifact(filePath) {
  const stat = await lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32 * 1024 * 1024)
    throw new Error('Evidence must be a regular local file at most 32 MiB (no symlinks)');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}
function insufficient(reason) {
  return {
    decision:'insufficient_evidence', reasons:[reason],
    baselinePassRate:null, pilotPassRate:null,
    timeChangePct:null, costChangePct:null, productionApproved:false,
    artifactHashesVerified:false,
  };
}
export async function review(mode, paths) {
  if (mode === 'plan' && paths.length === 1) {
    const request = JSON.parse(await readFile(paths[0], 'utf8'));
    return assessRufloPilotRequest(request);
  }
  if (mode === 'compare' && paths.length === 5) {
    const [baselinePath, pilotPath, fixturePath, baselineEvidencePath, pilotEvidencePath] = paths;
    const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
    const pilot = JSON.parse(await readFile(pilotPath, 'utf8'));
    const [fixtureSha, baselineEvidenceSha, pilotEvidenceSha] = await Promise.all([
      digestArtifact(fixturePath), digestArtifact(baselineEvidencePath),
      digestArtifact(pilotEvidencePath),
    ]);
    if (baseline.sourceSnapshotSha256 !== fixtureSha || pilot.sourceSnapshotSha256 !== fixtureSha)
      return insufficient('Fixture SHA-256 does not match the actual benchmark input file');
    if (baseline.outputEvidenceSha256 !== baselineEvidenceSha ||
        pilot.outputEvidenceSha256 !== pilotEvidenceSha)
      return insufficient('Output evidence SHA-256 does not match the actual result files');
    const assessment = evaluateRufloAgainstBaseline(baseline, pilot);
    return { ...assessment, artifactHashesVerified: true };
  }
  throw new Error('Usage: node --experimental-strip-types scripts/ruflo-pilot-report.mjs plan <request.json> | compare <baseline.json> <ruflo.json> <fixture> <baseline-evidence> <ruflo-evidence>');
}
if (process.argv[1]?.endsWith('/ruflo-pilot-report.mjs') || process.argv[1]?.endsWith('\\ruflo-pilot-report.mjs')) {
  review(process.argv[2], process.argv.slice(3))
    .then(result => {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if (result.status === 'blocked' || result.status === 'approval_required' ||
          result.decision === 'reject' || result.decision === 'insufficient_evidence')
        process.exitCode = 2;
    })
    .catch(error => { console.error(error.message); process.exitCode = 2; });
}
