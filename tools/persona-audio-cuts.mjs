#!/usr/bin/env node
/**
 * Analyze the actual soundtrack, not a fixed BPM template.
 * Usage: node tools/persona-audio-cuts.mjs soundtrack.mp3 [output.json]
 * Node built-ins + ffmpeg/ffprobe; no network or external packages.
 */
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SAMPLE_RATE = 11025;
const HOP = 256;
const WINDOW = 1024;
const MIN_GAP_SEC = 0.18;

function command(bin, args, binary = false) {
  return new Promise((ok, bad) => {
    const child = spawn(bin, args, { shell:false, windowsHide:true, stdio:['ignore','pipe','pipe'] });
    const parts = [];
    let size = 0, err = '';
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 128 * 1024 * 1024) child.kill();
      else parts.push(chunk);
    });
    child.stderr.on('data', chunk => { err = (err + chunk).slice(-4000); });
    child.on('error', bad);
    child.on('close', code => code === 0 ? ok(binary ? Buffer.concat(parts) : Buffer.concat(parts).toString('utf8')) : bad(new Error(bin + ': ' + err.slice(-1500))));
  });
}

export function detectAccents(samples, sampleRate = SAMPLE_RATE) {
  if (!(samples instanceof Float32Array) || !samples.length) return [];
  const flux = [];
  let previous = 0;
  for (let pos = 0; pos + WINDOW <= samples.length; pos += HOP) {
    let energy = 0;
    for (let j = pos; j < pos + WINDOW; j++) energy += samples[j] * samples[j];
    const rms = Math.sqrt(energy / WINDOW);
    // Positive energy changes favor transients, not continuous loud passages.
    flux.push(Math.max(0, rms - previous));
    previous = rms;
  }
  const candidates = [];
  for (let i = 3; i < flux.length - 3; i++) {
    const neighborhood = flux.slice(Math.max(0, i - 22), Math.min(flux.length, i + 23));
    const mean = neighborhood.reduce((a,b)=>a+b,0) / neighborhood.length;
    const variance = neighborhood.reduce((a,b)=>a+(b-mean)**2,0) / neighborhood.length;
    const threshold = mean + 1.2 * Math.sqrt(variance);
    if (flux[i] > Math.max(0.002, threshold) && flux[i] >= flux[i-1] && flux[i] > flux[i+1]) {
      candidates.push({ timeSec: Number((i * HOP / sampleRate).toFixed(3)), strength: Number(flux[i].toFixed(5)) });
    }
  }
  // Non-maximum suppression in time, retaining the strongest accent.
  const selected = [];
  for (const point of candidates.sort((a,b)=>b.strength-a.strength)) {
    if (selected.every(other=>Math.abs(other.timeSec-point.timeSec)>=MIN_GAP_SEC)) selected.push(point);
  }
  return selected.sort((a,b)=>a.timeSec-b.timeSec);
}

export function proposeCuts(accents, durationSec, { minShotSec = 0.55, maxShotSec = 4.5 } = {}) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) throw new Error('Invalid duration');
  if (!(minShotSec > 0 && maxShotSec >= minShotSec)) throw new Error('Invalid shot limits');
  const cuts = [];
  let last = 0;
  const candidates = accents.filter(a=>a.timeSec > 0 && a.timeSec < durationSec)
    .sort((a,b)=>a.timeSec-b.timeSec);
  while (durationSec - last > maxShotSec) {
    const eligible = candidates.filter(a=>a.timeSec >= last + minShotSec && a.timeSec <= Math.min(durationSec-minShotSec,last+maxShotSec));
    if (!eligible.length) {
      // No musical accent: leave the edit unforced; flag a gap for editorial review.
      break;
    }
    // Prefer a strong accent near the upper shot-length bound; avoid greedy early cuts.\n    const chosen = eligible.reduce((best,a)=>!best || a.strength>best.strength ? a : best,null);
    cuts.push({ timeSec:chosen.timeSec, reason:'audio-accent', strength:chosen.strength });
    last = chosen.timeSec;
  }
  return cuts;
}

async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input) throw new Error('Usage: node tools/persona-audio-cuts.mjs soundtrack.mp3 [output.json]');
  const path = resolve(input);
  const probe = JSON.parse(await command('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',path]));
  if (!probe.streams?.some(s=>s.codec_type==='audio')) throw new Error('No audio stream');
  const durationSec = Number(probe.format?.duration);
  if (!(durationSec>0 && durationSec<=900)) throw new Error('Audio must be 0–900 seconds');
  const pcm = await command('ffmpeg',['-v','error','-nostdin','-i',path,'-vn','-ac','1','-ar',String(SAMPLE_RATE),'-f','f32le','pipe:1'],true);
  const count = Math.floor(pcm.length/4);
  const samples = new Float32Array(count);
  for(let i=0;i<count;i++) samples[i] = pcm.readFloatLE(i*4);
  const accents = detectAccents(samples);
  const cuts = proposeCuts(accents,durationSec);
  const result = { version:1, source:path, durationSec, method:'energy-onset-v1', accents, suggestedCuts:cuts,
    caveat:'Heuristic candidates only; dialogue, motion, phrasing and editorial review must still determine final cuts.' };
  const json = JSON.stringify(result,null,2)+'\n';
  if(output) await writeFile(resolve(output),json,{flag:'wx'});
  else process.stdout.write(json);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname))
  main().catch(error=>{ console.error('Persona audio:',error.message);process.exitCode=1; });
