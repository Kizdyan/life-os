#!/usr/bin/env node
/**
 * Local, non-destructive Persona media engine. Requires ffmpeg and ffprobe.
 * node tools/persona-media-engine.mjs probe input.mp4
 * node tools/persona-media-engine.mjs render input.mp4 output.mp4 [startSec] [durationSec]
 * No network calls or paid AI requests.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile, access } from 'node:fs/promises';
import { dirname, resolve, extname } from 'node:path';

const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const ALLOWED = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
const fail = message => { throw new Error(message); };
function bounded(value, label, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) fail('Invalid ' + label);
  return n;
}
function run(bin, args) {
  return new Promise((done, reject) => {
    const proc = spawn(bin, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', data => { stdout += data; if (stdout.length > 8_000_000) proc.kill(); });
    proc.stderr.on('data', data => { stderr = (stderr + data).slice(-30_000); });
    proc.on('error', reject);
    proc.on('close', code => code === 0 ? done(stdout) : reject(new Error(bin + ' exited ' + code + ': ' + stderr.slice(-2500))));
  });
}
async function probe(input) {
  if (!ALLOWED.has(extname(input).toLowerCase())) fail('Unsupported video extension');
  const info = await stat(input);
  if (!info.isFile() || !info.size || info.size > MAX_BYTES) fail('Invalid input file size');
  const raw = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,format_name,size:stream=index,codec_type,codec_name,width,height,r_frame_rate', '-of', 'json', input]);
  const data = JSON.parse(raw);
  const video = data.streams?.find(stream => stream.codec_type === 'video');
  if (!video || !video.width || !video.height) fail('No decodable video stream');
  const durationSec = bounded(data.format?.duration, 'duration', 0.01, 86400);
  return { input, bytes: info.size, durationSec, width: video.width, height: video.height, fps: video.r_frame_rate, videoCodec: video.codec_name, audioCodec: data.streams?.find(stream => stream.codec_type === 'audio')?.codec_name ?? null, container: data.format?.format_name };
}
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
async function render(input, output, start, requestedDuration) {
  if (resolve(input) === resolve(output)) fail('Output must not overwrite the source');
  if (extname(output).toLowerCase() !== '.mp4') fail('Output must be .mp4');
  await access(output).then(() => fail('Output already exists; choose a new name'), () => {});
  await access(output + '.persona.json').then(() => fail('Manifest already exists'), () => {});
  const source = await probe(input);
  const startSec = bounded(start ?? 0, 'start', 0, source.durationSec - 0.01);
  const durationSec = bounded(requestedDuration ?? source.durationSec - startSec, 'duration', 0.01, source.durationSec - startSec + 0.001);
  await mkdir(dirname(output), { recursive: true });
  const temp = output + '.partial-' + process.pid + '.mp4';
  try {
    await run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-y', '-ss', String(startSec), '-i', input, '-t', String(durationSec), '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', temp]);
    const result = await probe(temp);
    const tolerance = Math.max(1, durationSec * 0.05);
    if (Math.abs(result.durationSec - durationSec) > tolerance) fail('Export duration mismatch');
    const sourceHash = await sha256(input);
    const outputHash = await sha256(temp);
    const manifest = { version: 1, operation: 'trim-transcode', input: { ...source, sha256: sourceHash }, output: { ...result, input: undefined, path: output, sha256: outputHash }, settings: { startSec, durationSec, videoCodec: 'libx264', crf: 20, audioCodec: 'aac' }, verification: { passed: true, durationToleranceSec: tolerance } };
    await rename(temp, output);
    try {
      await writeFile(output + '.persona.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    } catch (error) {
      await rm(output, { force: true });
      throw error;
    }
    return manifest;
  } finally { await rm(temp, { force: true }).catch(() => {}); }
}
async function main() {
  const [command, inputArg, outputArg, start, duration] = process.argv.slice(2);
  if (!inputArg || !['probe', 'render'].includes(command)) fail('Usage: probe <input> | render <input> <output.mp4> [startSec] [durationSec]');
  const input = resolve(inputArg);
  const result = command === 'probe' ? await probe(input) : await render(input, resolve(outputArg ?? fail('Missing output')), start, duration);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}
main().catch(error => { console.error('Persona Media Engine:', error.message); process.exitCode = 1; });
