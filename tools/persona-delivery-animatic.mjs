#!/usr/bin/env node
/**
 * Local planning animatic for Persona's first Reel. It renders labelled cards
 * and the selected original sketch; it is deliberately not a substitute for
 * filmed material or an artistic approval.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fail = message => { throw new Error(message); };
const sceneIds = ['A01','B01','A02','B02','A03','B03','A04'];
const palette = ['1d3557','264653','3d405b','2a9d8f','6d597a','7f5539','3a506b'];

function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-10000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolveRun(stdout) : reject(new Error(`${basename(command)} failed (${code}): ${stderr.slice(-1800)}`)));
  });
}

function q(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

export function wrapAnimaticText(value, maxCharacters = 48) {
  const words=String(value).trim().split(/\s+/u);
  const lines=[]; let line='';
  for (const word of words) {
    const next=line ? `${line} ${word}` : word;
    if (line && next.length > maxCharacters) { lines.push(line); line=word; }
    else line=next;
  }
  if (line) lines.push(line);
  return lines.join('\n');
}

async function sha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

async function probe(ffprobe, path) {
  const raw = await run(ffprobe, ['-v','error','-show_entries','format=duration:stream=codec_name,codec_type,width,height,r_frame_rate','-of','json',path]);
  const data = JSON.parse(raw), video = data.streams?.find(stream => stream.codec_type === 'video');
  const audio = data.streams?.find(stream => stream.codec_type === 'audio');
  return { durationSec:Number(data.format?.duration), video, audio };
}

/** Builds exact card timing; the B03 tail preserves 1.5 seconds for a reaction before A04. */
export function buildAnimaticTimeline(brief, sketchDurationSec) {
  if (!brief || !Array.isArray(brief.script) || brief.script.length !== 7) fail('Selected candidate needs exactly seven script beats');
  if (!Number.isFinite(sketchDurationSec) || sketchDurationSec <= 0) fail('The selected music sketch needs a positive duration');
  let cursor = 0;
  const beats = brief.script.map((beat, index) => {
    if (beat.order !== index + 1 || !Number.isFinite(beat.durationSec) || beat.durationSec <= 0 || typeof beat.line !== 'string' || typeof beat.action !== 'string') fail(`Invalid candidate beat ${index + 1}`);
    const startSec = Number(cursor.toFixed(2)); cursor += beat.durationSec;
    return { order:beat.order, sceneId:sceneIds[index], line:beat.line, action:beat.action, durationSec:beat.durationSec, startSec, endSec:Number(cursor.toFixed(2)) };
  });
  const b03 = beats[5];
  const musicStart = Number((b03.endSec - sketchDurationSec - 1.5).toFixed(2));
  if (musicStart <= b03.startSec + 0.25) fail('B03 is too short for spoken line, selected music and the reaction hold');
  return {
    kind:'persona-planning-animatic-v1', filmed:false, authorApproved:false,
    notice:'Планировочный аниматик: не снятый ролик, не художественный PASS и не материал для публикации.',
    durationSec:Number(cursor.toFixed(2)), beats,
    music:{startSec:musicStart,endSec:Number((musicStart + sketchDurationSec).toFixed(2)),beatOrder:6},
  };
}

function ffmpegDrawFilter(index, beat, fontPath) {
  const header = `АНИМАТИК · НЕ СНЯТЫЙ РОЛИК · ${beat.sceneId} · ${beat.startSec}–${beat.endSec} с`;
  const line = wrapAnimaticText(`«${beat.line}»`, 34).split('\n');
  const action = wrapAnimaticText(`Действие: ${beat.action}`, 46).split('\n');
  const font = q(fontPath);
  const dialogueFilters=line.map((text,row)=>`drawtext=fontfile='${font}':text='${q(text)}':fontcolor=white:fontsize=42:x=70:y=${260+row*58}`);
  const actionStart=260+line.length*58+70;
  const actionFilters=action.map((text,row)=>`drawtext=fontfile='${font}':text='${q(text)}':fontcolor=white@0.88:fontsize=27:x=70:y=${actionStart+row*40}`);
  return `[${index}:v]drawbox=x=70:y=120:w=940:h=2:color=white@0.65:t=fill,drawtext=fontfile='${font}':text='${q(header)}':fontcolor=white:fontsize=30:x=70:y=55,${dialogueFilters.concat(actionFilters).join(',')}[v${index}]`;
}

export async function renderDeliveryAnimatic({ briefPath, v1BriefPath, sketchPath, outputDir, ffmpeg='ffmpeg', ffprobe='ffprobe', fontPath='C:/Windows/Fonts/arial.ttf' } = {}) {
  if (![briefPath, v1BriefPath, sketchPath, outputDir].every(value => typeof value === 'string' && value.trim())) fail('Provide selected brief, archived V1 brief, sketch WAV and a new output directory');
  const selectedPath=resolve(briefPath), archivedPath=resolve(v1BriefPath), wavPath=resolve(sketchPath), root=resolve(outputDir);
  await Promise.all([access(selectedPath),access(archivedPath),access(wavPath),access(fontPath)]);
  const selected=JSON.parse(await readFile(selectedPath,'utf8'));
  const archived=JSON.parse(await readFile(archivedPath,'utf8'));
  const wav=await probe(ffprobe,wavPath);
  if (!wav.audio || !Number.isFinite(wav.durationSec)) fail('Selected sketch is not a readable audio file');
  const timeline=buildAnimaticTimeline(selected,wav.durationSec);
  if (timeline.durationSec !== 31) fail(`Selected candidate must total 31 seconds, got ${timeline.durationSec}`);
  await access(root).then(() => fail('Animatic output directory already exists'), () => {});
  await mkdir(root,{recursive:false});
  const output=join(root,'actor-composer-planning-animatic.mp4');
  try {
    const args=['-hide_banner','-nostdin','-loglevel','error','-y'];
    for (const [index,beat] of timeline.beats.entries()) args.push('-f','lavfi','-i',`color=c=0x${palette[index]}:s=1080x1920:r=30:d=${beat.durationSec}`);
    args.push('-f','lavfi','-i',`anullsrc=channel_layout=stereo:sample_rate=48000:d=${timeline.durationSec}`,'-i',wavPath);
    const video=timeline.beats.map((beat,index)=>ffmpegDrawFilter(index,beat,fontPath)).join(';') + ';' + timeline.beats.map((_,index)=>`[v${index}]`).join('') + `concat=n=${timeline.beats.length}:v=1:a=0[v]`;
    const delay=Math.round(timeline.music.startSec * 1000);
    const audio=`[7:a]volume=0[silence];[8:a]adelay=${delay}|${delay},atrim=duration=${wav.durationSec},volume=0.72[music];[silence][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95:level=0[a]`;
    args.push('-filter_complex',`${video};${audio}`,'-map','[v]','-map','[a]','-t',String(timeline.durationSec),'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-r','30','-c:a','aac','-ar','48000','-ac','2','-b:a','160k','-movflags','+faststart',output);
    await run(ffmpeg,args);
    const result=await probe(ffprobe,output);
    if (result.video?.codec_name !== 'h264' || result.audio?.codec_name !== 'aac' || result.video?.width !== 1080 || result.video?.height !== 1920 || Math.abs(result.durationSec-timeline.durationSec)>0.25) fail('Animatic output did not meet H.264/AAC 1080x1920 30 fps timing requirements');
    const comparison=['# A03/B03 — V1 и выбранный редакторский кандидат','','Это сравнение текста и планирования. Оно не является результатом Ollama и не утверждено автором.','', '| Сцена | V1 (архив) | Выбранный кандидат |', '|---|---|---|', ...[4,5].map(index=>`| ${sceneIds[index]} | «${archived.script[index].line}» — ${archived.script[index].action} | «${selected.script[index].line}» — ${selected.script[index].action} |`), '', `Музыкальный эскиз начинается на ${timeline.music.startSec} с и завершается на ${timeline.music.endSec} с: после реплики B03, до A04.`, 'Аниматик — только для репетиции пауз, структуры и темпа; он не использует пользовательские видеоматериалы.'].join('\n');
    const manifest={...timeline,selectedBrief:selectedPath,archivedV1Brief:archivedPath,selectedSketch:{path:wavPath,sha256:await sha256(wavPath),durationSec:wav.durationSec},output:{path:output,sha256:await sha256(output),durationSec:result.durationSec,videoCodec:result.video.codec_name,audioCodec:result.audio.codec_name,width:result.video.width,height:result.video.height,fps:result.video.r_frame_rate},verification:{technical:true,artisticApproval:false,filmedMaterial:false}};
    await writeFile(join(root,'ANIMATIC.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    await writeFile(join(root,'A03-B03-comparison.md'),comparison+'\n',{flag:'wx'});
    return {output,manifestPath:join(root,'ANIMATIC.json'),comparisonPath:join(root,'A03-B03-comparison.md'),timeline};
  } catch (error) {
    await writeFile(join(root,'FAILED.json'),JSON.stringify({status:'failed',error:String(error.message||error),notice:'Input briefs and WAV were not modified.'},null,2)+'\n',{flag:'wx'}).catch(()=>{});
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const [briefPath,v1BriefPath,sketchPath,outputDir,ffmpeg,ffprobe] = process.argv.slice(2);
  renderDeliveryAnimatic({briefPath,v1BriefPath,sketchPath,outputDir,ffmpeg:ffmpeg||'ffmpeg',ffprobe:ffprobe||'ffprobe'})
    .then(result=>process.stdout.write(JSON.stringify({output:result.output,manifest:result.manifestPath,comparison:result.comparisonPath,notice:result.timeline.notice},null,2)+'\n'))
    .catch(error=>{console.error(`Persona planning animatic: ${error.message}`);process.exitCode=1;});
}
