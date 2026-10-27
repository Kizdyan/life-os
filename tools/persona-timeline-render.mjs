#!/usr/bin/env node
/**
 * Persona multi-clip timeline renderer.
 * Usage: node tools/persona-timeline-render.mjs project.json output.mp4
 * Project: {"version":1,"clips":[{"path":"a.mp4","startSec":0,"durationSec":2},...]}
 * Local only. No uploads, AI calls or destructive source modifications.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, mkdir, mkdtemp, rename, rm, stat, writeFile, access } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const fail = message => { throw new Error(message); };
const allowed = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);
function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; if (stdout.length > 4_000_000) child.kill(); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-20_000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolveRun(stdout) : reject(new Error(command + ' failed (' + code + '): ' + stderr.slice(-1800))));
  });
}
function numeric(value, label, min, max) {
  const n = Number(value);
  if (typeof value !== 'number' || !Number.isFinite(n) || n < min || n > max) fail('Invalid ' + label);
  return n;
}
async function probe(path) {
  const raw = await run('ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_type,width,height','-of','json',path]);
  const data = JSON.parse(raw);
  const video = data.streams?.find(stream => stream.codec_type === 'video');
  if (!video?.width || !video?.height) fail('Video stream missing: ' + path);
  return { durationSec: numeric(Number(data.format?.duration), 'source duration', 0.02, 86400), width: video.width, height: video.height, audio: data.streams.some(stream => stream.codec_type === 'audio') };
}
async function hash(path) {
  const digest = createHash('sha256');
  for await (const part of createReadStream(path)) digest.update(part);
  return digest.digest('hex');
}
async function main() {
  const [projectArg, outputArg] = process.argv.slice(2);
  if (!projectArg || !outputArg) fail('Usage: node tools/persona-timeline-render.mjs project.json output.mp4');
  const projectPath = resolve(projectArg), output = resolve(outputArg);
  if (extname(output).toLowerCase() !== '.mp4') fail('Output must be .mp4');
  const project = JSON.parse(await readFile(projectPath, 'utf8'));
  if (project.version !== 1 || !Array.isArray(project.clips) || project.clips.length < 2 || project.clips.length > 30) fail('Expected 2–30 clips in version 1 project');
  const width = numeric(project.width ?? 1080, 'width', 128, 3840);
  const height = numeric(project.height ?? 1920, 'height', 128, 3840);
  const fps = numeric(project.fps ?? 30, 'fps', 15, 60);
  if (width % 2 || height % 2 || !Number.isInteger(fps)) fail('Dimensions must be even; fps must be integer');
  await access(output).then(() => fail('Output already exists'), () => {});
  await access(output + '.persona.json').then(() => fail('Manifest already exists'), () => {});
  const clips = [];
  for (const [index, clip] of project.clips.entries()) {
    if (!clip || typeof clip.path !== 'string' || !clip.path.trim()) fail('Invalid clip path at ' + index);
    const path = isAbsolute(clip.path) ? resolve(clip.path) : resolve(dirname(projectPath), clip.path);
    if (!allowed.has(extname(path).toLowerCase())) fail('Unsupported clip extension at ' + index);
    if (path === output || path === projectPath || path === output + '.persona.json') fail('Output cannot overwrite a source');
    const file = await stat(path);
    if (!file.isFile() || !file.size || file.size > 2 * 1024 ** 3) fail('Invalid clip size at ' + index);
    const media = await probe(path);
    const startSec = numeric(clip.startSec ?? 0, 'startSec', 0, media.durationSec - 0.02);
    const durationSec = numeric(clip.durationSec ?? media.durationSec - startSec, 'durationSec', 0.02, media.durationSec - startSec + 0.001);
    clips.push({ path, startSec, durationSec, media, sha256: await hash(path) });
  }
  let soundtrack = null;
  if (project.soundtrack !== undefined) {
    if (!project.soundtrack || typeof project.soundtrack.path !== 'string') fail('Invalid soundtrack');
    const musicPath = isAbsolute(project.soundtrack.path) ? resolve(project.soundtrack.path) : resolve(dirname(projectPath), project.soundtrack.path);
    if (!new Set(['.mp3','.m4a','.wav','.aac','.flac','.ogg','.mp4']).has(extname(musicPath).toLowerCase())) fail('Unsupported soundtrack format');
    const musicStat = await stat(musicPath);
    if (!musicStat.isFile() || musicStat.size < 1 || musicStat.size > 250 * 1024 * 1024) fail('Invalid soundtrack size');
    const info = JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',musicPath]));
    if (!info.streams?.some(s=>s.codec_type==='audio')) fail('Soundtrack has no audio');
    const musicDuration = Number(info.format?.duration);
    if (!Number.isFinite(musicDuration) || musicDuration <= 0 || musicDuration > 86400) fail('Invalid soundtrack duration');
    const startSec = numeric(project.soundtrack.startSec ?? 0,'soundtrack startSec',0,Math.max(0,musicDuration-0.001));
    const volume = numeric(project.soundtrack.volume ?? 0.8,'soundtrack volume',0,2);
    const originalVolume = numeric(project.soundtrack.originalVolume ?? 0.2,'original volume',0,2);
    soundtrack = { path:musicPath,startSec,volume,originalVolume,sha256:await hash(musicPath) };
  }
  const totalSec = clips.reduce((sum, clip) => sum + clip.durationSec, 0);
  if (totalSec > 900) fail('Timeline exceeds 15 minute safety limit');
  const tempDir = await mkdtemp(join(tmpdir(), 'persona-timeline-'));
  await mkdir(dirname(output), { recursive: true });
  const staged = join(tempDir, 'render.mp4');
  try {
    const segments = [];
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i], segment = join(tempDir, 'clip-' + i + '.mp4');
      const videoFilter = 'scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease,pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2,setsar=1,fps=' + fps + ',format=yuv420p';
      const args = ['-hide_banner','-nostdin','-loglevel','error','-y','-ss',String(clip.startSec),'-i',clip.path];
      if (!clip.media.audio) args.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=48000');
      args.push('-t',String(clip.durationSec),'-map','0:v:0','-map',clip.media.audio?'0:a:0':'1:a:0','-vf',videoFilter,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-af','aresample=async=1:first_pts=0','-shortest','-movflags','+faststart',segment);
      await run('ffmpeg', args);
      segments.push(segment);
    }
    // Concatenation via individual input arguments; no shell or unescaped concat file.
    const args = ['-hide_banner','-nostdin','-loglevel','error','-y'];
    for (const segment of segments) args.push('-i',segment);
    const concat = segments.map((_, i) => '[' + i + ':v:0][' + i + ':a:0]').join('') + 'concat=n=' + segments.length + ':v=1:a=1[v][a]';
    args.push('-filter_complex',concat,'-map','[v]','-map','[a]','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',staged);
    if (soundtrack) {
      const assembled=join(tempDir,'assembled.mp4');
      await run('ffmpeg',[...args.slice(0,-1),assembled]);
      const filter='[0:a]volume='+soundtrack.originalVolume+'[original];[1:a]atrim=start='+soundtrack.startSec+',asetpts=PTS-STARTPTS,volume='+soundtrack.volume+',atrim=duration='+totalSec+',asetpts=PTS-STARTPTS[music];[original][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]';
      await run('ffmpeg',['-hide_banner','-nostdin','-loglevel','error','-y','-i',assembled,'-stream_loop','-1','-i',soundtrack.path,'-filter_complex',filter,'-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-t',String(totalSec),'-movflags','+faststart',staged]);
    } else await run('ffmpeg',args);
    const actual = await probe(staged);
    if (!actual.audio || actual.width !== width || actual.height !== height) fail('Rendered media streams or dimensions mismatch');
    const toleranceSec = Math.max(0.25, totalSec * 0.06);
    if (Math.abs(actual.durationSec - totalSec) > toleranceSec) fail('Timeline output duration mismatch');
    const manifest = { version:1, operation:'timeline-render', project:projectPath, settings:{width,height,fps}, clips, soundtrack, output:{path:output,sha256:await hash(staged),...actual}, verification:{passed:true,expectedDurationSec:totalSec,toleranceSec} };
    await rename(staged,output);
    try { await writeFile(output + '.persona.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'}); }
    catch (error) { await rm(output,{force:true}); throw error; }
    process.stdout.write(JSON.stringify({output,manifest:output+'.persona.json',durationSec:actual.durationSec,clips:clips.length})+'\n');
  } finally { await rm(tempDir,{recursive:true,force:true}); }
}
main().catch(error => { console.error('Persona timeline:',error.message); process.exitCode = 1; });
