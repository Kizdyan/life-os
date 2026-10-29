#!/usr/bin/env node
/** Compile a human-review packet from independently pinned local Git evidence, without installing or executing a Skill. */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifySkillCheckout } from './skill-source-verify-git.mjs';

export function compileSkillSourceReviewPacket(report) {
  if (!report || report.revisionVerified !== true ||
      report.verificationMethod !== 'pinned-local-git-tree-blob' ||
      report.upstreamPublisherAuthenticated !== false ||
      report.reviewerApproved !== false ||
      report.installationPerformed !== false || report.executionPerformed !== false ||
      !/^[a-f0-9]{40}$/i.test(report.sourceRevision ?? '') ||
      !/^[a-f0-9]{64}$/i.test(report.bundleSha256 ?? '') ||
      !/^[a-f0-9]{64}$/i.test(report.manifestSha256 ?? '') ||
      !Array.isArray(report.files) || !Array.isArray(report.findings) ||
      typeof report.staticCheckPassed !== 'boolean' ||
      report.staticCheckPassed !== (report.inventoryComplete === true && report.findings.length === 0) ||
      report.scannedFiles !== report.files.length) throw Error('Missing independent pinned source evidence');
  const blocked = !report.inventoryComplete || report.findings.some(f => f.severity !== 'review');
  const review = report.findings.filter(f => f.severity === 'review').map(f => ({
    path: f.path, rule: f.rule, severity: 'review', acknowledged: false,
  }));
  return {
    schemaVersion: 1, kind: 'skill-source-review-packet',
    sourceRevision: report.sourceRevision, sourceSkillPath: report.sourceSkillPath,
    manifestSha256: report.manifestSha256, bundleSha256: report.bundleSha256,
    scannedFiles: report.scannedFiles, totalBytes: report.totalBytes,
    files: report.files.map(f => ({ path: f.path, sizeBytes: f.sizeBytes, sha256: f.sha256 })),
    findings: report.findings, outstandingReviewFindings: review,
    status: blocked ? 'blocked' : 'manual_review_required',
    checklist: [
      'Verify publisher identity and source ownership independently',
      'Check license and commercial-use permission',
      'Read the entire instruction set and any executable helpers for injections or side effects',
      'Review network, filesystem, secret and auto-install permissions',
      'Record identified human reviewer and explicit approvals for each finding',
      'Run isolated synthetic benchmarks and verify the target agent before installing',
    ],
    reviewerApproved: false, sourcePublisherAuthenticated: false,
    humanReviewRequired: true, mayInstallAutomatically: false,
    mayExecuteAutomatically: false, installationPerformed: false, executionPerformed: false,
  };
}

export async function reviewPinnedSkillCheckout(checkout, subpath, commit) {
  return compileSkillSourceReviewPacket(await verifySkillCheckout(checkout, subpath, commit));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length < 5 || process.argv.length > 6) {
    console.error('Usage: npm run skills:review-source -- <checkout> <skill-subpath> <40hex-commit> [new-report.json]');
    process.exitCode = 2;
  } else reviewPinnedSkillCheckout(process.argv[2], process.argv[3], process.argv[4])
    .then(async packet => {
      const json = JSON.stringify(packet, null, 2) + '\n';
      if (process.argv[5]) await writeFile(resolve(process.argv[5]), json, { flag: 'wx' });
      else process.stdout.write(json);
      if (packet.status === 'blocked') process.exitCode = 1;
    }).catch(() => { console.error('Pinned source review failed; check checkout and source integrity'); process.exitCode = 2; });
}
