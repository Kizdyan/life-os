#!/usr/bin/env node
/** Deterministic, offline-only triage of discovery reports; never treats catalog metadata as provenance. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OWNER = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO = /^[a-zA-Z0-9_.-]{1,100}$/;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const MAX_REPORTS = 12, MAX_CANDIDATES = 50;
const properText = s => typeof s === 'string' && s.length <= 120 && !/[\x00-\x1f\x7f]/.test(s);

function verifiedShape(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  if (typeof candidate.source !== 'string' || typeof candidate.slug !== 'string') return false;
  const parts = candidate.source.split('/');
  if (parts.length !== 2 || !OWNER.test(parts[0]) || !REPO.test(parts[1]) ||
      parts[1] === '.' || parts[1] === '..' || !SLUG.test(candidate.slug) ||
      candidate.slug === '.' || candidate.slug === '..' ||
      candidate.id !== candidate.source + '/' + candidate.slug ||
      !properText(candidate.name) || !Number.isSafeInteger(candidate.installsReported) ||
      candidate.installsReported < 0) return false;
  return candidate.status === 'discovery_only' && candidate.approved === false &&
    candidate.installed === false && candidate.verifiedWorking === false &&
    candidate.sourceRevision === null && candidate.manifestSha256 === null &&
    candidate.bundleSha256 === null && candidate.license === null &&
    candidate.sourceUrl === 'https://github.com/' + candidate.source &&
    candidate.catalogUrl === 'https://skills.sh/' + candidate.id;
}

export function createSkillReviewQueue(batch, { limit = 50 } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('Invalid queue limit');
  if (!batch || batch.schemaVersion !== 1 || batch.kind !== 'skill-discovery-batch' ||
      batch.source !== 'skills.sh' || !Array.isArray(batch.reports) ||
      !batch.reports.length || batch.reports.length > MAX_REPORTS ||
      batch.installationPerformed !== false || batch.executionPerformed !== false ||
      batch.mayInstallAutomatically !== false || batch.mayExecuteAutomatically !== false)
    throw Error('Unsafe or incompatible batch report');
  const candidates = new Map();
  const seenTopics = new Set();
  for (const report of batch.reports) {
    if (!report || !properText(report.topic) || seenTopics.has(report.topic) ||
        report.schemaVersion !== 1 || report.source !== 'skills.sh' ||
        report.humanReviewRequired !== true || report.mayInstallAutomatically !== false ||
        report.mayExecuteAutomatically !== false || report.installationPerformed !== false ||
        report.executionPerformed !== false || !properText(report.query) ||
        !Array.isArray(report.candidates) || report.candidates.length > MAX_CANDIDATES ||
        report.returned !== report.candidates.length) throw Error('Unsafe or incompatible topic report');
    seenTopics.add(report.topic);
    for (const item of report.candidates) {
      if (!verifiedShape(item)) throw Error('Untrusted or promoted catalog candidate');
      let existing = candidates.get(item.id);
      if (!existing) {
        existing = { id: item.id, name: item.name, sourceUrl: item.sourceUrl,
          catalogUrl: item.catalogUrl, installsReported: item.installsReported,
          possibleDuplicate: item.isDuplicate === true, matchedTopics: [],
          sourceRevision: null, license: null,
          status: 'discovery_only', approved: false, installed: false, verifiedWorking: false,
          mayInstallAutomatically: false, mayExecuteAutomatically: false,
          requiredNextChecks: [
            'Pin Git commit and independently verify all package files',
            'Inspect permissions, license, dependencies and security',
            'Obtain human approval after source review',
            'Benchmark with synthetic tasks before activating the agent',
          ],
        };
        candidates.set(item.id, existing);
      }
      if (!existing.matchedTopics.includes(report.topic)) existing.matchedTopics.push(report.topic);
      existing.possibleDuplicate ||= item.isDuplicate === true;
      existing.installsReported = Math.max(existing.installsReported, item.installsReported);
    }
  }
  const queue = [...candidates.values()];
  queue.forEach(c => {
    c.matchedTopics.sort();
    // More independent task matches first; popularity is a capped tie-breaker only.
    c.discoveryScore = c.matchedTopics.length * 100 + Math.min(5, Math.log10(1 + c.installsReported)) -
      (c.possibleDuplicate ? 10 : 0);
  });
  queue.sort((a, b) => b.discoveryScore - a.discoveryScore || a.id.localeCompare(b.id));
  return { schemaVersion: 1, kind: 'skill-review-queue',
    source: 'skills.sh', topicCount: seenTopics.size,
    totalUniqueCandidates: queue.length, queue: queue.slice(0, limit),
    humanReviewRequired: true, mayInstallAutomatically: false,
    mayExecuteAutomatically: false, installationPerformed: false, executionPerformed: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), [file] = args;
  const out = args.length === 3 && args[1] === '--out' && args[2] ? args[2] : null;
  if (args.length !== 1 && !out) {
    console.error('Usage: npm run skills:queue -- batch-report.json [--out new-queue.json]');
    process.exitCode = 2;
  } else readFile(resolve(file)).then(data => {
    if (data.byteLength > 1_500_000) throw Error('Batch report exceeds size limit');
    return createSkillReviewQueue(JSON.parse(data.toString('utf8')));
  }).then(async queue => {
    const json = JSON.stringify(queue, null, 2) + '\n';
    if (out) await writeFile(resolve(out), json, { flag: 'wx' });
    else process.stdout.write(json);
  }).catch(() => { console.error('Invalid report or queue output path'); process.exitCode = 1; });
}
