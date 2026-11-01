#!/usr/bin/env node
/** Offline, side-effect-free evaluation CLI. Requires Node.js 22.16+ for TS stripping. */
import { readFile } from 'node:fs/promises';
import { assessRufloPilotRequest, evaluateRufloAgainstBaseline } from '../packages/core/src/ruflo-pilot.ts';

export async function review(mode, paths) {
  if (mode === 'plan' && paths.length === 1) {
    const request = JSON.parse(await readFile(paths[0], 'utf8'));
    return assessRufloPilotRequest(request);
  }
  if (mode === 'compare' && paths.length === 2) {
    const baseline = JSON.parse(await readFile(paths[0], 'utf8'));
    const pilot = JSON.parse(await readFile(paths[1], 'utf8'));
    return evaluateRufloAgainstBaseline(baseline, pilot);
  }
  throw new Error('Usage: node --experimental-strip-types scripts/ruflo-pilot-report.mjs plan <request.json> | compare <baseline.json> <ruflo.json>');
}
if (process.argv[1]?.endsWith('/ruflo-pilot-report.mjs') || process.argv[1]?.endsWith('\\ruflo-pilot-report.mjs')) {
  review(process.argv[2], process.argv.slice(3))
    .then(result => { process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      if(result.status === 'blocked' || result.decision === 'reject' || result.decision === 'insufficient_evidence') process.exitCode=2;
    })
    .catch(error => { console.error(error.message); process.exitCode = 2; });
}