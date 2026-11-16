/** Local libass burn-in. Original video/audio and existing results are never overwritten. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createReadStream,constants} from 'node:fs';
import {readFile,writeFile,stat,mkdtemp,mkdir,copyFile,rm,access,realpath} from 'node:fs/promises';
import {resolve,dirname,join,isAbsolute,relative,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {cachedFfprobe} from './persona-stage-cache.mjs';

const fail=message=>{throw Error('Persona subtitles: '+message)};
function time(ms){const n=Math.round(ms/10);return `${Math.floor(n/360000)}:${String(Math.floor(n/6000)%60).padStart(2,'0')}:${String(Math.floor(n/100)%60).padStart(2,'0')}.${String(n%100).padStart(2,'0')}`}
function referenceStyle(style){
 const family=/^[\p{L}\p{N} _-]{1,80}$/u;
 const validRatio=n=>Number.isFinite(n)&&n>=.05&&n<=.95;
 if(style?.version!==1||!family.test(style.fontFamily??'')||!family.test(style.fontStyle??'')||
    !/^#[a-f\d]{6}$/i.test(style.color??'')||
    ![style.xRatio,style.yRatio].every(validRatio)||!Number.isInteger(style.fontSize1080)||
    style.fontSize1080<20||style.fontSize1080>180||style.outlinePx!==0||style.shadowPx!==0||
    style.case!=='uppercase'||style.lineBreak!=='approved'||style.animation?.unit!=='cue'||
    style.animation?.movement!=='none'||!Number.isInteger(style.animation.fadeInMs)||
    style.animation.fadeInMs<0||style.animation.fadeInMs>1000||
    !/^[a-f\d]{64}$/i.test(style.referenceSha256??'')||!(/^[a-f\d]{64}$/i.test(style.fontSha256??'')))
  fail('Invalid reference subtitle config');
 return style;
}

export async function loadSubtitleReference(path){
 const file=await realpath(path),style=referenceStyle(JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,'')));
 if(typeof style.fontFile!=='string'||isAbsolute(style.fontFile)||!/\.ttf$/i.test(style.fontFile))fail('Expected a local TTF');
 const fontPath=await realpath(resolve(dirname(file),style.fontFile)),fromConfig=relative(dirname(file),fontPath);
 if(isAbsolute(fromConfig)||fromConfig.split(/[\\/]/)[0]==='..')fail('Reference font is outside its config directory');
 if((await hash(fontPath)).toLowerCase()!==style.fontSha256.toLowerCase())fail('Reference font SHA-256 mismatch');
 return {style,fontPath};
}

export async function loadApprovedSubtitleReference(){
 const path=fileURLToPath(new URL('./subtitle-standard-v1/subtitle_render_config.json',import.meta.url));
 if(await hash(path)!=='1b8bba7b221b4ee58cc12fd1f3137fa07c5873ed0139af30fec41f3861aa6eb6')
  fail('Approved subtitle standard SHA-256 mismatch');
 const approved=await loadSubtitleReference(path);
 if(approved.style.fontFamily!=='Cormorant Garamond'||approved.style.fontStyle!=='Light')
  fail('Production subtitles require Cormorant Garamond Light');
 return approved;
}

export function subtitlePreset(value='cinematic'){
 if(value!=='cinematic'&&value!=='dynamic-interview'&&value!=='signature-gold')fail('Unsupported subtitle preset');
 return value;
}

const interviewFont={
 fontFamily:'Montserrat',fontStyle:'ExtraBold',font:'Montserrat ExtraBold',
 fontSha256:'d3ac6a843d3ba6d5cafd44cf39e437055c8aed7e261010f595f57d3c7b3e2c1b'
};
const interviewSize=95,interviewAccentSize=120;

export async function loadSubtitlePreset(preset){
 const selected=subtitlePreset(preset);
 if(selected==='cinematic')return loadApprovedSubtitleReference();
 if(selected==='signature-gold'){
  // Reuse the approved, integrity-pinned Cormorant font. Never rely on an
  // uninstalled Windows/macOS font or silently substitute another typeface.
  const base=await loadApprovedSubtitleReference();
  const configPath=fileURLToPath(new URL('./subtitle-signature-gold-v1/preset.json',import.meta.url));
  const gold=JSON.parse(await readFile(configPath,'utf8'));
  if(gold?.id!=='signature-gold'||gold.displayName!=='Quiet Luxury / Signature Subtitles v1.0'||
   gold.fontFamily!==base.style.fontFamily||gold.fontStyle!==base.style.fontStyle||
   gold.fontWeight!==500||gold.fontSize1080!==87||gold.letterWidthPercent!==106||
   gold.color!=='#8F6639'||gold.lowerThirdYRatio!==0.755||
   gold.fadeInMs!==150||gold.fadeOutMs!==330||gold.outlinePx!==0||
   gold.shadowPx!==0||gold.backdrop!==false||gold.capitalization!=='uppercase')
   fail('Signature Gold preset config does not match approved v1.0 contract');
  return {style:{...base.style,...gold,fontSha256:base.style.fontSha256,preset:'signature-gold'},fontPath:base.fontPath};
 }
 const fontPath=fileURLToPath(new URL('./subtitle-dynamic-interview-v1/Montserrat-ExtraBold.ttf',import.meta.url));
 if(await hash(fontPath)!==interviewFont.fontSha256)fail('Dynamic Interview font SHA-256 mismatch');
 return {style:interviewFont,fontPath};
}

export function verifySubtitleFont(stderr,fontPath){
 const selections=stderr.split('\n').filter(line=>line.includes('fontselect:'));
 const exact=basename(fontPath,'.ttf');
 if(!selections.length||selections.some(line=>!line.split('->').at(-1).includes(exact)))
  fail('libass did not confirm the configured font');
 return selections;
}

function assHeader(width,height,style){
 return `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nWrapStyle: 2\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Persona,${style}\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
}

function referenceAss(cues,width,height,style){
 referenceStyle(style);
 const font=style.fontStyle==='Regular'?style.fontFamily:style.fontFamily+' '+style.fontStyle;
 const x=Math.round(width*style.xRatio),y=Math.round(height*style.yRatio);
 const [r,g,b]=style.color.slice(1).match(/../g);
 const size=Math.round(width*style.fontSize1080/1080);
 const header=assHeader(width,height,`${font},${size},&H00${b}${g}${r},&H00000000,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,0,0,0,1`);
 const ass=header+cues.map(c=>{
  const fade=Math.min(c.fadeMs??style.animation.fadeInMs,Math.max(0,c.endMs-c.startMs-34));
  const plain=c.text.replace(/\r?\n/g,'\\N');
  if(c.motion==='fly-in'){
   const start=time(Math.floor(c.startMs/10)*10),end=time(Math.floor(c.endMs/10)*10);
   const movement=Math.min(100,c.endMs-c.startMs);
   return `Dialogue: 0,${start},${end},Persona,,0,0,0,,{\\move(${x},${y+Math.round(height*.045)},${x},${y},0,${movement})}${plain}`;
  }
  if(!c.kinetic)return `Dialogue: 0,${time(c.startMs)},${time(c.endMs)},Persona,,0,0,0,,{\\pos(${x},${y})\\fad(${fade},0)}${plain}`;
  const zoom='{\\fscx90\\fscy90\\t(0,200,\\fscx100\\fscy100)}';
  const reset='{\\fscx100\\fscy100}';
  const words=new Set(c.keywords??[]);
  const text=words.size?plain.split(/(\\N|[\s\p{P}]+)/u).map(word=>words.has(word)?zoom+word+reset:word).join(''):zoom+plain;
  // ASS is centisecond-based. Flooring the event avoids missing a 30 fps beat frame.
  const start=time(Math.floor(c.startMs/10)*10);
  return `Dialogue: 0,${start},${time(Math.floor(c.endMs/10)*10)},Persona,,0,0,0,,{\\pos(${x},${y})}${text}`;
 }).join('\n')+'\n';
 return {ass,cues,style:{...style,font,size,position:{x,y}},timingMethod:'approved-cues'};
}

function signatureGoldAss(cues,width,height,style){
 // This is deliberately separate from the immutable Cinematic reference.
 // Existing typography, geometry and rendering code remain byte-identical.
 if(style?.preset!=='signature-gold'||style.color!=='#8F6639'||
    style.fontSize1080!==87||style.letterWidthPercent!==106||
    style.outlinePx!==0||style.shadowPx!==0||style.backdrop!==false)
  fail('Signature Gold requires the verified signature preset');
 const font=style.fontFamily+' '+style.fontStyle;
 const x=Math.round(width*.5),y=Math.round(height*style.lowerThirdYRatio);
 const size=Math.round(width*style.fontSize1080/1080);
 const primary='&H0039668F'; // ASS is BBGGRR; #8F6639 is RGB
 const header=assHeader(width,height,
  [font,size,primary,'&H00000000','&H00000000','&H00000000',
   style.fontWeight,0,0,0,style.letterWidthPercent,100,0,0,1,0,0,5,0,0,0,1].join(','));
 const ass=header+cues.map(c=>{
  const duration=c.endMs-c.startMs;
  const fadeIn=Math.min(c.fadeMs??style.fadeInMs,Math.floor(duration*.35));
  const fadeOut=Math.min(style.fadeOutMs,Math.max(0,Math.floor(duration*.45)));
  const text=c.text.replace(/\r?\n/g,'\\N');
  return 'Dialogue: 0,'+time(c.startMs)+','+time(c.endMs)+
   ',Persona,,0,0,0,,{\\pos('+x+','+y+')\\fscx106\\fad('+fadeIn+','+fadeOut+')}'+text;
 }).join('\n')+'\n';
 return {ass,cues,style:{...style,font,size,position:{x,y}},timingMethod:'approved-cues'};
}

function interviewAss(cues,width,height,typography){
 const x=Math.round(width*.5),y=Math.round(height*.64);
 const base=typography?.sizePx1080??interviewSize;
 const size=Math.round(width*base/1080),accentSize=Math.round(width*base*interviewAccentSize/interviewSize/1080);
 const primary=(typography?.color??'#FFFFFF').slice(1).match(/../g).reverse().join('');
 const shadow=Math.max(1,Math.round(width*3/1080)),margin=Math.ceil(width*.075);
 const maxWidth=width-2*margin-2*shadow;
 const header=assHeader(width,height,`${interviewFont.font},${size},&H00${primary},&H00000000,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,${shadow},5,${margin},${margin},0,1`);
 const groups=[];
 const events=[];
 for(const cue of cues){
  const phrases=cue.text.split(/\s+\/\s+|\r?\n/).filter(phrase=>phrase.trim());
  const words=phrases.flatMap(phrase=>phrase.trim().split(/\s+/));
  const keyword=words.filter(word=>/\p{L}{5}/u.test(word)).at(-1);
  const keywords=new Set(cue.keywords??(keyword?[keyword.replace(/[^\p{L}\p{N}-]/gu,'')]:[]));
  const accent=word=>/\p{N}/u.test(word)||keywords.has(word.replace(/[^\p{L}\p{N}-]/gu,''));
  // Allow for wide glyphs and rounding before assigning a second word to a line.
  const wordWidth=word=>[...word].reduce((sum,char)=>sum+(/[A-ZА-ЯЁ0-9]/u.test(char)&&!/[ЖШЩЫЮМW]/u.test(char)?1.08:1.5),0)
   *(accent(word)?accentSize:size);
  const lines=[];
  for(const phrase of phrases){
   const tokens=phrase.trim().split(/\s+/);
   for(let i=0;i<tokens.length;i++){
    const line=[tokens[i]];
    if(tokens[i+1]&&wordWidth(tokens[i])+size*.5+wordWidth(tokens[i+1])<=maxWidth)
     line.push(tokens[++i]);
    lines.push(line);
   }
  }
  const start=Math.round(cue.startMs/10),end=Math.round(cue.endMs/10);
  if(!lines.length||end-start<lines.length)fail('Dynamic Interview cue is too short for its word groups');
  for(const [index,line] of lines.entries()){
   const startMs=Math.round(start+(end-start)*index/lines.length)*10;
   const endMs=Math.round(start+(end-start)*(index+1)/lines.length)*10;
   const text=line.join(' ');
   const lineWidth=line.reduce((sum,word)=>sum+wordWidth(word),0)+(line.length-1)*size*.5;
   const scale=Math.min(100,Math.floor(100*maxWidth/lineWidth));
   if(scale===0)fail('Dynamic Interview word is too wide for the frame');
   const pop=Math.min(120,endMs-startMs);
   const styled=line.map(word=>accent(word)?`{\\c&H2012E3&\\fs${accentSize}}${word}{\\c&H${primary}&\\fs${size}}`:word).join(' ');
   groups.push({startMs,endMs,text});
   events.push(`Dialogue: 0,${time(startMs)},${time(endMs)},Persona,,0,0,0,,{\\pos(${x},${y})\\fscx${Math.round(scale*.9)}\\fscy90\\t(0,${pop},\\fscx${scale}\\fscy100)}${styled}`);
  }
 }
 return {ass:header+events.join('\n')+'\n',cues:groups,
  style:{...interviewFont,size,accentSize,position:{x,y}},timingMethod:'split-approved-cues'};
}

export function buildSubtitleAss({cues,width,height,reference,preset,typography}={}){
 const selected=subtitlePreset(preset);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<128||height<128||width>3840||height>3840)fail('Invalid video dimensions');
 if(!Array.isArray(cues)||!cues.length||cues.length>1000)fail('Missing or excessive caption cues');
 const short=[];let previous=0;
 for(const cue of cues){
  if(!Number.isSafeInteger(cue.startMs)||!Number.isSafeInteger(cue.endMs)||cue.startMs<previous||cue.endMs<=cue.startMs||cue.endMs>900000)fail('Invalid or overlapping caption timestamps');
  if(typeof cue.text!=='string'||!cue.text.trim()||/[\\{}\x00-\x08\x0b-\x1f]/.test(cue.text))fail('Only plain caption text is supported');
  if(cue.fadeMs!==undefined&&(!Number.isInteger(cue.fadeMs)||cue.fadeMs<0||cue.fadeMs>1000))fail('Invalid subtitle fade');
  if(cue.motion!==undefined&&cue.motion!=='fly-in')fail('Unsupported title motion');
  const text=cue.text.trim().toUpperCase();
  if(cue.keywords!==undefined&&(!Array.isArray(cue.keywords)||!cue.keywords.length||cue.keywords.length>12||
     cue.keywords.some(word=>typeof word!=='string'||!/^[-\p{L}\p{N}]+$/u.test(word)||
       !text.split(/[^\p{L}\p{N}-]+/u).includes(word.toUpperCase()))))fail('Invalid kinetic keywords');
  short.push({...cue,text,...(cue.keywords?{keywords:cue.keywords.map(word=>word.toUpperCase())}:{})});
  previous=cue.endMs;
 }
 return selected==='dynamic-interview'?interviewAss(short,width,height,typography):
  selected==='signature-gold'?signatureGoldAss(short,width,height,reference):
  referenceAss(short,width,height,
   typography?{...reference,color:typography.color??reference.color,fontSize1080:typography.sizePx1080??reference.fontSize1080}:reference);
}
async function hash(path){const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')}
function run(bin,args,cwd){return new Promise((ok,no)=>{const child=spawn(bin,args,{cwd,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();no(Error('Subtitle FFmpeg task timed out'))},300000);child.stdout.on('data',b=>stdout=(stdout+b).slice(-1000000));child.stderr.on('data',b=>stderr=(stderr+b).slice(-20000));child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',code=>{clearTimeout(timer);code===0?ok({stdout,stderr}):no(Error('Subtitle process failed: '+stderr.slice(-1800)))})})}
export {run as runSubtitleCommand};
export async function burnPersonaSubtitles({videoPath,reviewPath,outputPath,ffmpegDir,preset}={}){
 if(![videoPath,reviewPath,outputPath].every(p=>typeof p==='string'&&p.trim()))fail('Provide video, subtitle review and NEW output MP4');
 const input=resolve(videoPath),review=resolve(reviewPath),output=resolve(outputPath);
 if(!output.toLowerCase().endsWith('.mp4')||input===output)fail('Use a new output MP4');
 const reportPath=output+'.persona-subtitles.json',assPath=output+'.ass';
 for(const path of [output,reportPath,assPath])await access(path).then(()=>fail('Output already exists: '+path),()=>{});
 const bin=name=>ffmpegDir?join(resolve(ffmpegDir),name+(process.platform==='win32'?'.exe':'')):name;
 const info=await cachedFfprobe(input,{binary:bin('ffprobe'),run});
 const video=info.streams?.find(s=>s.codec_type==='video');
 if(!video||!Number.isFinite(Number(info.format?.duration)))fail('Readable video stream required');
 if(['smpte2084','arib-std-b67'].includes(video.color_transfer))fail('HDR requires an explicit tone-mapping policy; burn-in refused');
 if(Number(video.tags?.rotate??0)!==0||video.side_data_list?.some(s=>Number(s.rotation??0)!==0))fail('Normalize rotation in an explicitly approved copy first');
 if((await stat(review)).size>1000000)fail('Caption review too large');
 const raw=await readFile(review,'utf8'),sourceReview=JSON.parse(raw);
 const reference=await loadSubtitlePreset(preset);
 const captions=buildSubtitleAss({cues:sourceReview.cues,width:video.width,height:video.height,reference:reference.style,preset});
 if(captions.cues.at(-1).endMs>Number(info.format.duration)*1000+30)fail('Captions exceed video duration');
 const sourceSha256=await hash(input);await mkdir(dirname(output),{recursive:true});
 const temp=await mkdtemp(join(dirname(output),'.persona-subtitles-')),created=[];
 try{
  await writeFile(join(temp,'captions.ass'),captions.ass,{flag:'wx'});
  await mkdir(join(temp,'fonts'));await copyFile(reference.fontPath,join(temp,'fonts',basename(reference.fontPath)));
  const staged=join(temp,'burned.mp4');
  // Fixed relative filter filename avoids Windows drive-colon / quote escaping hazards.
  const render=await run(bin('ffmpeg'),['-hide_banner','-nostdin','-n','-noautorotate','-i',input,'-map','0:v:0','-map','0:a?','-vf','ass=filename=captions.ass:fontsdir=fonts','-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p','-c:a','copy','-map_metadata','0','-movflags','+faststart',staged],temp);
  const fontSelections=verifySubtitleFont(render.stderr,reference.fontPath);
  const actual=await cachedFfprobe(staged,{binary:bin('ffprobe'),run});
  const v=actual.streams.find(s=>s.codec_type==='video');
  if(v.width!==video.width||v.height!==video.height||Math.abs(Number(actual.format.duration)-Number(info.format.duration))>.1)fail('Burned output geometry or duration changed');
  if(await hash(input)!==sourceSha256)fail('Input changed during rendering');
  const result={version:1,kind:'persona-burned-subtitles-v1',source:{path:input,sha256:sourceSha256},captionReviewSha256:createHash('sha256').update(raw).digest('hex'),captionTiming:sourceReview.captionTiming??'unverified',...captions,ass:undefined,
   fontSelections,audio:'stream-copy',output:{path:output,sha256:await hash(staged),bytes:(await stat(staged)).size,width:v.width,height:v.height,durationSec:Number(actual.format.duration)},assPath,publicationApproved:false,distributionAllowed:false,authorReviewRequired:true};
  await copyFile(staged,output,constants.COPYFILE_EXCL);created.push(output);
  await writeFile(assPath,captions.ass,{flag:'wx'});created.push(assPath);
  await writeFile(reportPath,JSON.stringify(result,null,2)+'\n',{flag:'wx'});created.push(reportPath);
  return {...result,reportPath};
 }catch(error){for(const path of created)await rm(path,{force:true});throw error}finally{await rm(temp,{recursive:true,force:true})}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [videoPath,reviewPath,outputPath,ffmpegDir,preset]=process.argv.slice(2);
 burnPersonaSubtitles({videoPath,reviewPath,outputPath,ffmpegDir,preset}).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1});
}
