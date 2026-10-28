#!/usr/bin/env node
/** Bounded, read-only catalog search for PUBLIC generic tasks only. No installation. */
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { searchSkillCatalog } from './skill-catalog-find.mjs';

export const SKILL_TOPIC_QUERIES = Object.freeze([
  { topic: 'persona-video', query: 'video editing ffmpeg' },
  { topic: 'persona-captions', query: 'subtitles captions transcription' },
  { topic: 'persona-design', query: 'photo color design' },
  { topic: 'engineering', query: 'react typescript testing' },
  { topic: 'e2e-testing', query: 'playwright browser testing' },
  { topic: 'ai-agents', query: 'agent skill discovery' },
  { topic: 'erika-voice', query: 'voice speech recognition' },
  { topic: 'data-reliability', query: 'postgres database security' },
]);
const TOPIC = /^[a-z][a-z0-9-]{1,40}$/;

export async function searchSkillTopics({ topics = SKILL_TOPIC_QUERIES, token, perTopic = 10, searchImpl = searchSkillCatalog } = {}) {
  if (!Array.isArray(topics) || !topics.length || topics.length > 12 ||
      !Number.isInteger(perTopic) || perTopic < 1 || perTopic > 25)
    throw Error('Invalid topic count or per-topic result limit');
  const seen = new Set();
  for (const item of topics) {
    if (!item || typeof item.topic !== 'string' || !TOPIC.test(item.topic) || seen.has(item.topic) ||
        typeof item.query !== 'string' || item.query.length < 2 || item.query.length > 120 ||
        /[\x00-\x1f\x7f]/.test(item.query)) throw Error('Invalid or duplicate topic');
    seen.add(item.topic);
  }
  if (typeof token !== 'string' || !token.trim()) throw Error('Vercel OIDC token required');
  const reports = [];
  for (const { topic, query } of topics) {
    const result = await searchImpl({ query, limit: perTopic, token });
    if (!result || result.schemaVersion !== 1 || result.source !== 'skills.sh' ||
        result.query !== query || result.mayInstallAutomatically !== false ||
        result.mayExecuteAutomatically !== false || !Array.isArray(result.candidates))
      throw Error('Unexpected catalog adapter result');
    reports.push({ topic, ...result });
  }
  return {
    schemaVersion: 1, kind: 'skill-discovery-batch', source: 'skills.sh',
    reports, topicsSearched: reports.length,
    humanReviewRequired: true, installationPerformed: false, executionPerformed: false,
    mayInstallAutomatically: false, mayExecuteAutomatically: false,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 2) {
    console.error('Usage: npm run skills:batch (uses eight non-sensitive public search topics)');
    process.exitCode = 2;
  } else searchSkillTopics({ token: process.env.VERCEL_OIDC_TOKEN })
    .then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
    .catch(() => { console.error('Catalog batch search failed: verify Vercel OIDC, network, and quota'); process.exitCode = 1; });
}
