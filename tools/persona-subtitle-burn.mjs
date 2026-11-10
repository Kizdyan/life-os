/** Local libass burn-in. Original video/audio and existing results are never overwritten. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {readFile,writeFile,stat,mkdtemp,mkdir,copyFile,rm,access} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getVisualPreset} from './persona-creative-director.mjs';

const fail=message=>{throw Error('Persona subtitles: '+message)};
function time(ms){const n=Math.round(ms/10);return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`}
export function buildSubtitleAss({cues,width,height,presetId,positionYRatio=.66}={}){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width>3840||height>3840)fail('Invalid video dimensions');
 if(!Array.isArray(cues)||!cues.length||cues.length>1000)fail('Missing or excessive caption cues');
 if(!Number.isFinite(positionYRatio)||positionYRatio<.25||positionYRatio>.78)fail('Invalid safe caption position');
 const short=[];let previous=0;
 for(const cue of cues){
  if(!Number.isSafeInteger(cue.startMs)||!Number.isSafeInteger(cue.endMs)||cue.startMs<previous||cue.endMs<=cue.startMs||cue.endMs>900000)fail('Invalid or overlapping caption timestamps');
  if(typeof cue.text!=='string'||!cue.text.trim()||/[\\{}\x00-\x08\x0b-\x1f]/.test(cue.text))fail('Only plain caption text is supported');
  const words=cue.text.trim().split(/\s+/u),groups=[];
  while(words.length){const size=words.length===4?2:Math.min(3,words.length);groups.push(words.splice(0,size).join(' '))}
  if(cue.endMs-cue.startMs<groups.length*10)fail('Cue too short for readable phrase groups');
  let offset=0;const total=groups.reduce((n,text)=>n+text.split(' ').length,0);
  for(const text of groups){const startMs=Math.round(cue.startMs+(cue.endMs-cue.startMs)*offset/total);offset+=text.split(' ').length;
   const endMs=Math.round(cue.startMs+(cue.endMs-cue.startMs)*offset/total);short.push({startMs,endMs,text});}
  previous=cue.endMs;
 }
 const style=getVisualPreset(presetId??'Dynamic').subtitles;
 if(!/^[\p{L}\p{N} _-]{1,80}$/u.test(style.font))fail('Invalid configured ASS font family');
 const fontSize=Math.round(width*style.fontSize/1080),outline=Math.max(1,Math.round(width*style.outline/1080)),margin=Math.round(width*.1),x=Math.round(width/2),y=Math.round(height*positionYRatio);
 const captionText=c=>{
  const parts=c.text.split(' ');let text=c.text;
  if(style.highlight==='longest-word'){
   let best=-1;for(let i=0;i<parts.length;i++)if(parts[i].length>=5&&(best<0||parts[i].length>parts[best].length))best=i;
   text=parts.map((word,i)=>i===best?`{\\c${style.highlightColor}&}${word}{\\c&HFFFFFF&}`:word).join(' ');
  }
  const fade=Math.min(style.fadeMs,Math.floor((c.endMs-c.startMs)/3));
  return `{\\pos(${x},${y})}${fade?`{\\fad(${fade},${fade})}`:''}${text}`;
 };
 const ass=`[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Persona,${style.font},${fontSize},${style.primaryColor??'&H00FFFFFF'},&H00FFFFFF,&H00000000,&H80000000,${style.bold?-1:0},0,0,0,100,100,0,0,1,${outline},${style.shadow},5,${margin},${margin},0,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`+
  short.map(c=>`Dialogue: 0,${time(c.startMs)},${time(c.endMs)},Persona,,0,0,0,,${captionText(c)}`).join('\n')+'\n';
 return {ass,cues:short,style:{...style,fontSize,outline,position:{x,y},wordsPerPhrase:'2–3 (one-word utterances retained)'},timingMethod:'proportional-phrase-timing-within-source-cues; requires author sync review'};
}
async function hash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')}
function run(bin,args,cwd){return new Promise((ok,no)=>{const child=spawn(bin,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();no(Error('Subtitle FFmpeg task timed out'))},300000);child.stdout.on('data',b=>stdout=(stdout+b).slice(-1000000));child.stderr.on('data',b=>stderr=(stderr+b).slice(-20000));child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',code=>{clearTimeout(timer);code===0?ok({stdout,stderr}):no(Error('Subtitle process failed: '+stderr.slice(-1800)))})})}
export async function burnPersonaSubtitles({videoPath,reviewPath,outputPath,ffmpegDir,presetId,positionYRatio}={}){
 if(![videoPath,reviewPath,outputPath].every(p=>typeof p==='string'&&p.trim()))fail('Provide video, subtitle review and NEW output MP4');
 const input=resolve(videoPath),review=resolve(reviewPath),output=resolve(outputPath);
 if(!output.toLowerCase().endsWith('.mp4')||input===output)fail('Use a new output MP4');
 const reportPath=output+'.persona-subtitles.json',assPath=output+'.ass';
 for(const path of [output,reportPath,assPath])await access(path).then(()=>fail('Output already exists: '+path),()=>{});
 const bin=name=>ffmpegDir?join(resolve(ffmpegDir),name+(process.platform==='win32'?'.exe':'')):name;
 const info=JSON.parse((await run(bin('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',input])).stdout);
 const video=info.streams?.find(s=>s.codec_type==='video');
 if(!video||!Number.isFinite(Number(info.format?.duration)))fail('Readable video stream required');
 if(['smpte2084','arib-std-b67'].includes(video.color_transfer))fail('HDR requires an explicit tone-mapping policy; burn-in refused');
 if(Number(video.tags?.rotate??0)!==0||video.side_data_list?.some(s=>Number(s.rotation??0)!==0))fail('Normalize rotation in an explicitly approved copy first');
 if((await stat(review)).size>1000000)fail('Caption review too large');
 const raw=await readFile(review,'utf8'),sourceReview=JSON.parse(raw);
 const captions=buildSubtitleAss({cues:sourceReview.cues,width:video.width,height:video.height,presetId,positionYRatio});
 if(captions.cues.at(-1).endMs>Number(info.format.duration)*1000+30)fail('Captions exceed video duration');
 const sourceSha256=await hash(input);await mkdir(dirname(output),{recursive:true});
 const temp=await mkdtemp(join(dirname(output),'.persona-subtitles-')),created=[];
 try{
  await writeFile(join(temp,'captions.ass'),captions.ass,{flag:'wx'});
  const staged=join(temp,'burned.mp4');
  // Fixed relative filter filename avoids Windows drive-colon / quote escaping hazards.
  const render=await run(bin('ffmpeg'),['-hide_banner','-nostdin','-n','-noautorotate','-i',input,'-map','0:v:0','-map','0:a?','-vf','ass=filename=captions.ass','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-map_metadata','0','-movflags','+faststart',staged],temp);
  const actual=JSON.parse((await run(bin('ffprobe'),['-v','error','-show_streams','-show_format','-of','json',staged])).stdout);
  const v=actual.streams.find(s=>s.codec_type==='video');
  if(v.width!==video.width||v.height!==video.height||Math.abs(Number(actual.format.duration)-Number(info.format.duration))>.1)fail('Burned output geometry or duration changed');
  if(await hash(input)!==sourceSha256)fail('Input changed during rendering');
  const result={version:1,kind:'persona-burned-subtitles-v1',source:{path:input,sha256:sourceSha256},captionReviewSha256:createHash('sha256').update(raw).digest('hex'),captionTiming:sourceReview.captionTiming??'unverified',...captions,ass:undefined,
   fontSelections:render.stderr.split('\n').filter(line=>line.includes('fontselect:')),audio:'stream-copy',output:{path:output,sha256:await hash(staged),bytes:(await stat(staged)).size,width:v.width,height:v.height,durationSec:Number(actual.format.duration)},assPath,publicationApproved:false,distributionAllowed:false,authorReviewRequired:true};
  await copyFile(staged,output,constants.COPYFILE_EXCL);created.push(output);
  await writeFile(assPath,captions.ass,{flag:'wx'});created.push(assPath);
  await writeFile(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});created.push(reportPath);
  return {...result,reportPath};
 }catch(error){for(const path of created)await rm(path,{force:true});throw error}finally{await rm(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [videoPath,reviewPath,outputPath,ffmpegDir]=process.argv.slice(2);
 burnPersonaSubtitles({videoPath,reviewPath,outputPath,ffmpegDir}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
}
