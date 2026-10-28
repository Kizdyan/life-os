import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSkillSearch, searchSkillCatalog, validateSearchOptions } from './skill-catalog-find.mjs';

const good = (patch = {}) => ({
  id: 'vercel-labs/skills/find-skills', source: 'vercel-labs/skills', slug: 'find-skills',
  name: 'Find Skills', sourceType: 'github', installs: 24531,
  url: 'https://evil.example/ignored', installUrl: 'https://evil.example/install', ...patch,
});
const fixture = (data = [good()]) => ({ data, query: 'video' });

describe('Skill Intelligence P2: skills.sh catalog discovery', () => {
  it('returns discovery-only candidate with canonical fixed-host URLs; never installs or approves', () => {
    const report = normalizeSkillSearch(fixture(), { query: 'video', limit: 10 });
    assert.equal(report.returned, 1);
    assert.equal(report.candidates[0].sourceUrl, 'https://github.com/vercel-labs/skills');
    assert.equal(report.candidates[0].catalogUrl, 'https://skills.sh/vercel-labs/skills/find-skills');
    assert.equal(report.candidates[0].sourceRevision, null);
    assert.equal(report.candidates[0].license, null);
    assert.equal(report.candidates[0].approved, false);
    assert.equal(report.mayInstallAutomatically, false);
    assert.equal(report.mayExecuteAutomatically, false);
    assert.equal(report.humanReviewRequired, true);
  });
  it('filters malformed, non-GitHub, forged ID, duplicate and invalid install counts', () => {
    const data = [good({ id: '../escape' }), good({ sourceType: 'well-known' }),
      good({ installs: -1 }), good(), good(), good({ source: 'other/repo', id: 'other/repo/find-skills' }),
      good({ slug: '..' }), good({ source: 'bad.org/repo', id: 'bad.org/repo/find-skills' })];
    const report = normalizeSkillSearch(fixture(data), { query: 'video', owner: 'vercel-labs' });
    assert.deepEqual(report.candidates.map(c => c.id), ['vercel-labs/skills/find-skills']);
  });
  it('preserves API relevance order rather than treating install count as proof', () => {
    const low = good({ id: 'other/skills/subtitles', source: 'other/skills', slug: 'subtitles', installs: 10 });
    const report = normalizeSkillSearch(fixture([low, good()]), { query: 'subtitles', limit: 1 });
    assert.equal(report.candidates[0].id, 'other/skills/subtitles');
  });
  it('flags possible catalog duplicates but never infers safety from popularity', () => {
    const report = normalizeSkillSearch(fixture([good({ isDuplicate: true, installs: 900000 })]), { query: 'video' });
    assert.equal(report.candidates[0].isDuplicate, true);
    assert.ok(report.candidates[0].cautions.some(c => c.includes('duplicate')));
    assert.equal(report.candidates[0].verifiedWorking, false);
  });
  it('rejects unsafe queries and malformed API payloads', () => {
    for (const query of ['x', 'abc\nAuthorization: hello', 'x'.repeat(121)])
      assert.throws(() => validateSearchOptions({ query }), /query/i);
    for (const payload of [{}, { data: null }, { data: Array(201).fill(good()) }])
      assert.throws(() => normalizeSkillSearch(payload, { query: 'video' }), /response format/);
    assert.throws(() => validateSearchOptions({ query: 'video', limit: 51 }), /Limit/);
  });
  it('uses only official HTTPS API, escapes query, and never sends source contents', async () => {
    let actual;
    const report = await searchSkillCatalog({ query: 'video subtitles', owner: 'vercel-labs', token: 'fake-test-token', fetchImpl: async (url, options) => {
      actual = { url, options };
      return new Response(JSON.stringify(fixture()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }});
    assert.equal(report.returned, 1);
    assert.equal(new URL(actual.url).origin, 'https://skills.sh');
    assert.equal(new URL(actual.url).pathname, '/api/v1/skills/search');
    assert.equal(new URL(actual.url).searchParams.get('q'), 'video subtitles');
    assert.equal(new URL(actual.url).searchParams.get('owner'), 'vercel-labs');
    assert.equal(actual.options.method, 'GET');
    assert.equal(actual.options.redirect, 'error');
    assert.equal(actual.options.headers.Authorization, 'Bearer fake-test-token');
    assert.equal(JSON.stringify(report).includes('fake-test-token'), false);
  });
  it('requires explicit OIDC token and never performs a request without one', async () => {
    let called = false;
    await assert.rejects(searchSkillCatalog({ query: 'react', token: '', fetchImpl: async () => { called = true; } }), /OIDC/);
    assert.equal(called, false);
  });
  it('rejects 401 and 429 without echoing response body or bearer token', async () => {
    for (const status of [401, 429]) {
      await assert.rejects(searchSkillCatalog({ query: 'react', token: 'never-print-this',
        fetchImpl: async () => new Response('secret response body', { status }) }), error =>
        !error.message.includes('never-print-this') && !error.message.includes('secret response body'));
    }
  });
  it('stops a streaming response that crosses the byte cap even without Content-Length', async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(180000)); controller.enqueue(new Uint8Array(90000)); controller.close(); },
    });
    await assert.rejects(searchSkillCatalog({ query: 'react', token: 'test',
      fetchImpl: async () => new Response(stream, { headers: { 'Content-Type': 'application/json' } }) }), /size limit/);
  });
  it('rejects overlarge and non-JSON responses', async () => {
    const long = 'x'.repeat(256_001);
    for (const response of [
      new Response(long, { headers: { 'Content-Type': 'application/json' } }),
      new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    ]) {
      await assert.rejects(searchSkillCatalog({ query: 'react', token: 'test',
        fetchImpl: async () => response }), /response|content type|limit/i);
    }
  });
});
