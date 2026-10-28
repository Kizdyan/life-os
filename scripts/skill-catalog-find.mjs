#!/usr/bin/env node
/**
 * Read-only skills.sh discovery adapter for Skill Intelligence.
 * Requires a Vercel OIDC token. It does NOT install, fetch source archives,
 * execute Skills, approve provenance, or publish private data.
 *
 * Usage: VERCEL_OIDC_TOKEN=... node scripts/skill-catalog-find.mjs "video subtitles" [--limit 10] [--owner vercel-labs]
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const API = 'https://skills.sh/api/v1/skills/search';
const MAX_BYTES = 256_000;
const OWNER = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
const REPO = /^[a-zA-Z0-9_.-]{1,100}$/;
const SLUG = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);

export function validateSearchOptions({ query, owner, limit = 10 }) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 120 ||
      /[\x00-\x1f\x7f]/.test(query)) throw Error('Search query must contain 2-120 printable characters');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('Limit must be an integer from 1 to 50');
  if (owner !== undefined && (typeof owner !== 'string' || !OWNER.test(owner))) throw Error('Invalid GitHub owner');
  return { query: query.trim(), owner, limit };
}

/** Treat every catalog field as untrusted: no URL from remote JSON reaches output verbatim. */
export function normalizeSkillSearch(raw, { query, limit = 10, owner } = {}) {
  const opts = validateSearchOptions({ query, limit, owner });
  if (!plain(raw) || !Array.isArray(raw.data) || raw.data.length > 200) throw Error('Unexpected skills.sh response format');
  const candidates = [], seen = new Set();
  for (const item of raw.data) {
    if (!plain(item) || item.sourceType !== 'github' || typeof item.source !== 'string' ||
        typeof item.slug !== 'string' || typeof item.id !== 'string') continue;
    const split = item.source.split('/');
    if (split.length !== 2 || !OWNER.test(split[0]) || !REPO.test(split[1]) ||
        split[1] === '.' || split[1] === '..' || !SLUG.test(item.slug) ||
        item.slug === '.' || item.slug === '..' || item.id !== item.source + '/' + item.slug ||
        (opts.owner && split[0].toLowerCase() !== opts.owner.toLowerCase()) ||
        seen.has(item.id)) continue;
    if (!Number.isSafeInteger(item.installs) || item.installs < 0) continue;
    seen.add(item.id);
    const name = typeof item.name === 'string' && item.name.length <= 120 &&
      !/[\x00-\x1f\x7f]/.test(item.name) && item.name.trim()
      ? item.name.trim() : item.slug;
    candidates.push({
      id: item.id, name, source: item.source, slug: item.slug,
      sourceUrl: 'https://github.com/' + item.source,
      catalogUrl: 'https://skills.sh/' + item.id,
      installsReported: item.installs,
      isDuplicate: item.isDuplicate === true,
      status: 'discovery_only',
      sourceRevision: null, manifestSha256: null, bundleSha256: null, license: null,
      approved: false, installed: false, verifiedWorking: false,
      cautions: [
        'Catalog listing is untrusted; inspect a pinned Git source before admission',
        'License, permissions, agent compatibility and security are unverified',
        ...(item.isDuplicate === true ? ['Catalog reports this as a possible duplicate'] : []),
      ],
    });
    if (candidates.length === opts.limit) break;
  }
  return {
    schemaVersion: 1, source: 'skills.sh', query: opts.query,
    owner: opts.owner ?? null, returned: candidates.length,
    candidates, humanReviewRequired: true,
    mayInstallAutomatically: false, mayExecuteAutomatically: false,
    installationPerformed: false, executionPerformed: false,
  };
}

async function limitedJson(response) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (Number(declared) > MAX_BYTES || Number(declared) < 0))
    throw Error('Catalog response exceeds size limit');
  if (!/\bapplication\/json\b/i.test(response.headers.get('content-type') ?? ''))
    throw Error('Unexpected catalog content type');
  if (!response.body) throw Error('Missing catalog response body');
  const chunks = []; let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > MAX_BYTES) {
      throw Error('Catalog response exceeds size limit');
    }
    chunks.push(chunk);
  }
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); }
  catch { throw Error('Invalid catalog JSON'); }
  return value;
}

export async function searchSkillCatalog({ query, owner, limit = 10, token, fetchImpl = fetch }) {
  const opts = validateSearchOptions({ query, owner, limit });
  if (typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token))
    throw Error('Vercel OIDC authentication required (VERCEL_OIDC_TOKEN)');
  const url = new URL(API);
  url.searchParams.set('q', opts.query);
  url.searchParams.set('limit', String(opts.limit));
  if (opts.owner) url.searchParams.set('owner', opts.owner);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url.toString(), {
      method: 'GET', redirect: 'error', signal: controller.signal,
      headers: { Accept: 'application/json', Authorization: 'Bearer ' + token },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw Error('skills.sh OIDC authentication rejected');
      if (response.status === 429) throw Error('skills.sh rate limit exceeded; retry later');
      throw Error('skills.sh returned HTTP ' + response.status);
    }
    return normalizeSkillSearch(await limitedJson(response), opts);
  } finally { clearTimeout(timeout); }
}

function parseArgs(argv) {
  const words = []; let owner, limit = 10;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit') {
      if (!argv[i + 1] || !/^\d+$/.test(argv[i + 1])) throw Error('Invalid --limit');
      limit = Number(argv[++i]);
    } else if (argv[i] === '--owner') {
      if (!argv[i + 1]) throw Error('Missing --owner value');
      owner = argv[++i];
    } else if (argv[i].startsWith('-')) throw Error('Unknown argument');
    else words.push(argv[i]);
  }
  return validateSearchOptions({ query: words.join(' '), owner, limit });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    searchSkillCatalog({ ...opts, token: process.env.VERCEL_OIDC_TOKEN })
      .then(report => process.stdout.write(JSON.stringify(report, null, 2) + '\n'))
      .catch(() => { console.error('Skill search failed: check OIDC authorization, network and API availability'); process.exitCode = 1; });
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
