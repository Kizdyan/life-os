import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = root.replaceAll('\\', '/');
const temporaryDirectory = realpathSync(tmpdir());
const output = mkdtempSync(join(temporaryDirectory, 'life-os-api-smoke-'));

try {
  writeFileSync(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  symlinkSync(join(root, 'node_modules'), join(output, 'node_modules'), 'junction');
  const config = join(output, 'tsconfig.json');
  writeFileSync(config, JSON.stringify({
    extends: join(root, 'api', 'tsconfig.json'),
    compilerOptions: { noEmit: false, rootDir: root, outDir: join(output, 'compiled'), typeRoots: [join(root, 'node_modules', '@types')] },
    include: [`${sourceDirectory}/api/**/*.ts`],
    exclude: [`${sourceDirectory}/api/**/*.test.ts`],
  }));
  execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', config], { cwd: root, stdio: 'inherit' });

  for (const name of [
    'LIFE_OS_OWNER_ID','LIFE_OS_OWNER_PASSCODE_SHA256','LIFE_OS_SESSION_SECRET','LIFE_OS_DATA_URL','LIFE_OS_SERVICE_KEY',
    'YANDEX_CLIENT_ID','YANDEX_CLIENT_SECRET','YANDEX_DISK_OAUTH_TOKEN','MEDIA_COOKIE_SECRET','OPENAI_API_KEY','openai_api_key',
  ]) delete process.env[name];

  const routes = [
    ['runtime/session','GET',503,{ configured:false, authenticated:false }],
    ['runtime/sync','POST',503,{ error:'runtime_not_configured' }],
    ['media/yandex/connect/start','POST',503,{ error:'yandex_oauth_not_configured' }],
    ['media/yandex/connect/callback','GET',302,null],
    ['media/yandex/disconnect','POST',200,{ connected:false, envManaged:false }],
  ];
  for (const [route, method, status, expected] of routes) {
    const moduleUrl = pathToFileURL(join(output, 'compiled', 'api', `${route}.js`));
    const { default: handler } = await import(moduleUrl.href);
    const response = await handler.fetch(new Request(`https://life.example.com/api/${route}`, { method }));
    assert.ok(response instanceof Response, `${route} must return a Web Response`);
    assert.equal(response.status, status, `${route} status`);
    assert.equal(response.headers.get('Cache-Control'), 'no-store', `${route} must not cache session state`);
    if (expected) { const body = await response.json(); for (const [key,value] of Object.entries(expected)) assert.equal(body[key],value,`${route}: ${key}`); }
    else assert.equal(response.headers.get('Location'), 'https://life.example.com/?media=yandex_error');
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
    body=await response.json(); assert.equal(body.error,error,`persona ${payload.action} guard`);
  }
  console.log('PASS Persona v4 production smoke guards');
} finally {
  assert.equal(dirname(output), temporaryDirectory, 'smoke output must stay within the temporary directory');
  assert.ok(basename(output).startsWith('life-os-api-smoke-'), 'cleanup must target the smoke directory');
  rmSync(output, { recursive: true, force: true });
}
