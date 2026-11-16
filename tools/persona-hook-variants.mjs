/** Render a controlled hook test locally with original audio and lossless picture. */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {copyFile, mkdir, mkdtemp, rename, rm, stat, writeFile} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {buildSubtitleAss, loadApprovedSubtitleReference, runSubtitleCommand} from './persona-subtitle-burn.mjs';
import {planFraming} from './persona-studio-framing.mjs';
import {cachedFfprobe,fullProbeArgs} from './persona-stage-cache.mjs';

const tones=['intrigue','direct','question'];
const restriction=['-protocol_whitelist','file','-format_whitelist','mov'];
const videoTags=['color_range','color_space','color_transfer','color_primaries','sample_aspect_ratio'];
const lossless=['-c:v','libx264','-qp','0','-preset','veryfast','-pix_fmt','yuv420p','-fps_mode','passthrough'];
async function hash(path){
 const h=createHash('sha256');
 for await(const bytes of createReadStream(path))h.update(bytes);
 return h.digest('hex');
}
function bin(name,dir){return dir?join(resolve(dir),name+(process.platform==='win32'?'.exe':'')):name;}

export async function inspectHookVideo(video,ffmpegDir){
 const data=await cachedFfprobe(video,{binary:bin('ffprobe',ffmpegDir),run:runSubtitleCommand,
  args:['-v','error',...restriction,...fullProbeArgs.slice(2)]});
 const stream=data.streams?.find(s=>s.codec_type==='video');
 const duration=Number(stream?.duration??data.format?.duration);
 if(!stream||stream.pix_fmt!=='yuv420p'||stream.disposition?.attached_pic||
    stream.width<128||stream.height<128||stream.width>3840||stream.height>3840||
    !Number.isFinite(duration)||duration<.5||duration>900||
    ['smpte2084','arib-std-b67'].includes(stream.color_transfer)||String(stream.color_primaries).startsWith('bt2020')||
    Number(stream.tags?.rotate||0)!==0||stream.side_data_list?.some(s=>Number(s.rotation||0)!==0))
  throw Error('Для A/B-теста нужен SDR MP4 (8-бит, 4:2:0) без метаданных поворота, до 15 минут.');
 const [sarWidth,sarHeight]=String(stream.sample_aspect_ratio).split(':').map(Number);
 const sar=sarWidth>0&&sarHeight>0?sarWidth/sarHeight:1;
 const startSec=Math.max(0,(Number(stream.start_time)||0)-(Number(data.format.start_time)||0));
 return {stream,duration,sar,startSec,audio:data.streams.filter(s=>s.codec_type==='audio')};
}

function wrap(text){
 if(text.length<=18)return text;
 const parts=text.split(' ');
 const splits=parts.slice(1).map((_,i)=>[parts.slice(0,i+1).join(' '),parts.slice(i+1).join(' ')]);
 const best=splits.filter(lines=>lines.every(s=>s.length<=20))
  .sort((a,b)=>Math.abs(a[0].length-a[1].length)-Math.abs(b[0].length-b[1].length))[0];
 if(!best)throw Error('Хук не помещается в две строки. Повторите генерацию.');
 return best.join('\n');
}

export function draftHookLines(drafts){
 if(!drafts||Object.keys(drafts).length!==3)throw Error('Ожидаются ровно три хука.');
 const normalized=new Set();
 return tones.map((tone,index)=>{
  const raw=drafts[tone];
  if(typeof raw!=='string'||raw.length>36||/[\\{}<>\p{C}]/u.test(raw)||!/[\p{L}]/u.test(raw))
   throw Error('Модель вернула непригодный текст хука.');
  const text=raw.trim().replace(/ +/g,' ');
  const key=text.toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]/gu,'');
  if(normalized.has(key)||(tone==='question'?!text.endsWith('?'):text.includes('?')))
   throw Error('Нужны три разные формулировки, включая вопрос.');
  normalized.add(key);
  return {index:index+1,tone,text,lines:wrap(text)};
 });
}

async function streamHash(ffmpeg, video, args){
 const {stdout}=await runSubtitleCommand(ffmpeg,['-v','error','-nostdin','-xerror',...restriction,'-i',video,
  ...args,'-f','streamhash','-hash','sha256','pipe:1']);
 return stdout.trim();
}

export async function renderHookVariants({video,sourceSha256,hookStartSec=0,hookDurationSec,kinetic=false,
 drafts,output,config={},ffmpegDir=config.ffmpegDir}){
 const lines=draftHookLines(drafts);
 video=resolve(video);output=resolve(output);
 const ffmpeg=bin('ffmpeg',ffmpegDir);
 const source=await inspectHookVideo(video,ffmpegDir);
 if(await hash(video)!==sourceSha256)throw Error('Исходный MP4 изменился перед A/B-тестом.');
 const startMs=Math.max(Math.ceil(source.startSec*100)*10+10,Math.ceil(hookStartSec*100)*10);
 const endMs=Math.min(startMs+Math.round((hookDurationSec??Math.min(2.4,source.duration*.55))*1000),
  Math.floor((source.startSec+source.duration-.04)*100)*10);
 if(!Number.isFinite(startMs)||!Number.isFinite(endMs)||endMs-startMs<240)
  throw Error('После выбранного начала недостаточно времени для хука.');
 const start=startMs/1000;
 const end=endMs/1000;
 const frameArgs=['-an','-c:v','rawvideo','-threads','1','-fps_mode','passthrough'];
 const firstFrame=['-map','0:v:0','-frames:v','1',...frameArgs];
 const untitled=['-map','0:v:0','-vf',`select='lt(t,${start})+gte(t,${end})'`,...frameArgs];
 const audio=['-map','0:a','-vn','-c:a','copy'];
 const originalAudio=source.audio.length?await streamHash(ffmpeg,video,audio):'';
 await mkdir(dirname(output),{recursive:true});
 const stage=await mkdtemp(join(dirname(output),'.hook-stage-'));
 try{
  let framing={mode:'native'}, picture=video, info=source;
  if(source.stream.width*source.sar>source.stream.height){
   const height=source.stream.height,width=Math.max(2,Math.round(source.stream.width*source.sar/2)*2);
   framing=await planFraming(video,{startSec:0,endSec:source.duration},{width,height},
    {...config,ffmpegDir,outputRoot:config.outputRoot??dirname(output)});
   const viewport=framing.mode==='face-crop'?
    'crop='+[framing.rect[2],framing.rect[3],framing.rect[0],framing.rect[1]].join(':')+
    ':exact=1,scale=1080:1920':
    'scale=1080:1920:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=1080:1920:(ow-iw)/2:(oh-ih)/2';
   picture=join(stage,'vertical.mp4');
   const normalize=source.sar===1?'':`scale=${width}:${height},setsar=1,`;
   await runSubtitleCommand(ffmpeg,['-v','error','-nostdin','-xerror','-n','-noautorotate',...restriction,'-i',video,
    '-map','0:v:0','-map','0:a?','-vf',normalize+viewport+',setsar=1','-c:a','copy',...lossless,picture]);
   info=await inspectHookVideo(picture,ffmpegDir);
  }
  const originalFirst=await streamHash(ffmpeg,picture,firstFrame);
  const originalUntitled=await streamHash(ffmpeg,picture,untitled);
  const {style,fontPath}=await loadApprovedSubtitleReference();
  const height=info.stream.height;
  const middle=Math.round(height*style.yRatio);
  const padding=Math.ceil(info.stream.width*style.fontSize1080/720);
  const top=Math.max(0,Math.floor((middle-padding)/2)*2);
  const bottom=Math.min(height,Math.ceil((middle+padding)/2)*2);
  const regions=[
   ...(top?[`crop=iw:${top}:0:0`]:[]),
   ...(bottom<height?[`crop=iw:${height-bottom}:0:${bottom}`]:[]),
  ];
  // These crops only select the pixels for comparison. The native render graph is ASS alone.
  const protectedArgs=regions.length===2?['-filter_complex',
   `[0:v:0]split[upper][lower];[upper]${regions[0]}[a];[lower]${regions[1]}[b];[a][b]vstack[pixels]`,
   '-map','[pixels]',...frameArgs]:
   regions.length?['-map','0:v:0','-vf',regions[0],...frameArgs]:null;
  const originalProtected=protectedArgs?await streamHash(ffmpeg,picture,protectedArgs):null;
  await mkdir(join(stage,'fonts'));
  await copyFile(fontPath,join(stage,'fonts',basename(fontPath)));
  const result=[];
  for(const {index,tone,text,lines:subtitle} of lines){
   const assName=`variant-${index}.ass`, file=`variant-${index}.mp4`;
   const caption=buildSubtitleAss({cues:[{text:subtitle,startMs,endMs,kinetic}],
    width:info.stream.width,height:info.stream.height,reference:style});
   await writeFile(join(stage,assName),caption.ass,{flag:'wx'});
   const filter=`ass=filename=${assName}:fontsdir=fonts`;
   const render=await runSubtitleCommand(ffmpeg,['-hide_banner','-nostats','-nostdin','-xerror','-n',
    '-noautorotate',...restriction,'-i',picture,'-map','0:v:0','-vf',filter,
    '-map','0:a?','-c:a','copy',...lossless,'-movflags','+faststart',file],stage);
   if(!render.stderr.split('\n').some(line=>line.includes('fontselect:')&&line.split('->').at(-1).includes(basename(fontPath,'.ttf'))))
    throw Error('FFmpeg не подтвердил утверждённый шрифт.');
   const path=join(stage,file),actual=await inspectHookVideo(path,ffmpegDir);
   if(['width','height','pix_fmt',...videoTags].some(k=>actual.stream[k]!==info.stream[k])||
      Math.abs(actual.duration-info.duration)>.04||
      await streamHash(ffmpeg,path,firstFrame)!==originalFirst||
      await streamHash(ffmpeg,path,untitled)!==originalUntitled||
      (protectedArgs&&await streamHash(ffmpeg,path,protectedArgs)!==originalProtected)||
      (source.audio.length&&await streamHash(ffmpeg,path,audio)!==originalAudio))
    throw Error('Контроль A/B-теста обнаружил изменение кадров вне хука, первого кадра, цвета, тайминга или звука.');
   result.push({index,tone,text,file,sha256:await hash(path),bytes:(await stat(path)).size,
    firstFrameIdentical:true,audioIdentical:true,tailIdentical:true,protectedPixelsIdentical:protectedArgs?true:null});
  }
  if(new Set(result.map(v=>v.sha256)).size!==3||await hash(video)!==sourceSha256)
   throw Error('Три самостоятельных варианта не подтверждены.');
  const report={version:1,sourceSha256,hookStartSec:start,hookEndSec:end,durationSec:info.duration,framing,
   variants:result,publicationApproved:false,distributionAllowed:false};
  await writeFile(join(stage,'RESULT.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await mkdir(output);
  let completed=false;
  try{
   for(const {index,file} of result){
    await rename(join(stage,file),join(output,file));
    const ass=`variant-${index}.ass`;
    await rename(join(stage,ass),join(output,ass));
   }
   await rename(join(stage,'RESULT.json'),join(output,'RESULT.json'));
   completed=true;
  }finally{if(!completed)await rm(output,{recursive:true,force:true});}
  return report;
 }finally{await rm(stage,{recursive:true,force:true});}
}
