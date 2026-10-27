import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const engine = resolve('tools/persona-media-engine.mjs');
const available = ['ffmpeg', 'ffprobe'].every(bin => spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0);
function run(args) {
  return spawnSync(process.execPath, [engine, ...args], { encoding: 'utf8', timeout: 60_000 });
}
test('refuses unsupported media input', () => {
  const result = run(['probe', 'unsupported.exe']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unsupported video extension/);
});
test('refuses render with missing output', () => {
  const result = run(['render', 'video.mp4']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing output/);
});
test('probes and renders a real local MP4 without altering its source', { skip: !available }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'persona-media-'));
  const input = join(dir, 'original.mp4');
  const output = join(dir, 'render.mp4');
  try {
    const generated = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=25', '-t', '2', '-c:v', 'mpeg4', input], { encoding: 'utf8', timeout: 30_000 });
    assert.equal(generated.status, 0, generated.stderr);
    const before = await readFile(input);
    const inspected = run(['probe', input]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.equal(JSON.parse(inspected.stdout).width, 320);
    const rendered = run(['render', input, output, '0.5', '1']);
    assert.equal(rendered.status, 0, rendered.stderr);
    const manifest = JSON.parse(await readFile(output + '.persona.json', 'utf8'));
    assert.equal(manifest.verification.passed, true);
    assert.equal(manifest.settings.startSec, 0.5);
    assert.ok((await stat(output)).size > 0);
    assert.deepEqual(await readFile(input), before);
    const overwrite = run(['render', input, output, '0', '1']);
    assert.notEqual(overwrite.status, 0);
    assert.match(overwrite.stderr, /already exists/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
