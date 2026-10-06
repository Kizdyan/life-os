import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = mkdtempSync(join(tmpdir(), 'life-os-api-smoke-'));
execFileSync('npx', ['tsc', '-p', 'api/tsconfig.json', '--outDir', join(output, 'compiled')], { stdio: 'inherit' });

const checks = [
  ['GET', 'runtime/session'],
  ['POST', 'runtime/sync'],
  ['POST', 'media/yandex/connect/start'],
  ['GET', 'media/yandex/connect/callback'],
  ['POST', 'media/yandex/disconnect'],
];

for (const [method, route] of checks) {
  const url = pathToFileURL(join(output, 'compiled', 'api', `${route}.js`));
  const mod = await import(url.href);
  const request = new Request(`https://life.example.com/api/${route}`, { method });
  const response = await mod.default.fetch(request);
  const status = response.status;
  if (route === 'media/yandex/disconnect') assert.equal(status, 200);
  else if (route === 'media/yandex/connect/callback') {
    assert.equal(status, 302);
    assert.equal(response.headers.get('Location'), 'https://life.example.com/?media=yandex_error');
  } else assert.equal(status, 503);
  console.log(`PASS ${method} /api/${route}: ${status}`);
}

const personaUrl = pathToFileURL(join(output, 'compiled', 'api', 'media', 'persona.js'));
const { default: persona } = await import(personaUrl.href);
let response = await persona.fetch(new Request('https://life.example.com/api/persona'));
assert.equal(response.status, 200, 'persona status');
assert.equal(response.headers.get('Cache-Control'), 'no-store', 'persona must not cache');
let body = await response.json();
assert.equal(body.pipelineVersion, 4, 'persona pipeline version');
assert.equal(typeof body.personaAI, 'boolean', 'persona AI status');

for (const [payload,status,error] of [
  [{action:'not-real'},400,'unknown_action'],
  [{action:'generate'},400,'idea_required'],
  [{action:'revise',feedback:'сделай лучше'},400,'draft_and_feedback_required'],
  [{action:'prepublish'},400,'draft_required'],
]) {
  response = await persona.fetch(new Request('https://life.example.com/api/persona',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));
  assert.equal(response.status,status,`persona ${payload.action} status`);
}

console.log('PASS Persona API smoke');
