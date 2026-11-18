/** Persona one-click local photo production and multi-platform distribution packages.
 * File names, dimensions and FFmpeg filters are allowlisted; sources are never overwritten.
 * Every generated item requires author review before publication.
 */
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,copyFile,stat,rm,rename} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {getVisualPreset} from './persona-creative-director.mjs';
import {burnPersonaSubtitles} from './persona-subtitle-burn.mjs';
import {layoutQuoteForSignatureGold} from './persona-ai-quote.mjs';

const photoFormats=Object.freeze({'4:5':[1080,1350],'1:1':[1080,1080]});
export const platformNames=Object.freeze(['instagram','tiktok','youtube','vk','vk-4x5','cover']);
const allowedPhoto=new Set(['.jpg','.jpeg','.png']);
export const imageSizes=photoFormats;
const hash=async(path)=>{const h=createHash('sha256');for await(const b of createReadStream(path))h.update(b);return h.digest('hex')};
const fnum=n=>String(Math.round(n*1000)/1000);
const fit=(w,h)=>'scale='+w+':'+h+':force_original_aspect_ratio=increase,crop='+w+':'+h+',setsar=1';
const filter=(w,h,preset)=>fit(w,h)+','+getVisualPreset(preset).filter+',format=yuv420p';
const bin=(config,name)=>config.ffmpegDir?join(config.ffmpegDir,name+(process.platform==='win32'?'.exe':'')):name;
const run=(config,name,args,opts={})=>config.run(bin(config,name),args,{env:config.env,timeoutMs:opts.timeoutMs??180000,maxStdout:opts.maxStdout??500000});
export function photoOutputSize(aspect){
 if(!Object.hasOwn(photoFormats,aspect))throw Error('Unsupported carousel ratio; choose 4:5 or 1:1');
 return photoFormats[aspect];
}
export async function inspectPhoto(path,config){
 const data=await run(config,'ffprobe',['-v','error','-select_streams','v:0',
  '-show_entries','stream=codec_name,width,height,pix_fmt:stream_tags=rotate:stream_side_data=rotation','-of','json',path]);
 let parsed;try{parsed=JSON.parse(data.toString('utf8'))}catch{throw Error('Photo is not decodable')}
 const stream=parsed.streams?.[0],w=stream?.width,h=stream?.height;
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<128||h<128||w>12000||h>12000)
  throw Error('Photo dimensions must be between 128 and 12000 pixels');
 if(Number(stream.tags?.rotate??0)!==0||stream.side_data_list?.some(s=>Number(s.rotation??0)!==0))
  throw Error('Normalize rotated photos before Persona import');
 if(!['mjpeg','png'].includes(stream.codec_name))throw Error('Only genuine JPEG or PNG photos are supported');
 return {width:w,height:h,codec:stream.codec_name};
}
async function singleFrame(config,source,output,w,h,preset){
 await run(config,'ffmpeg',['-nostdin','-v','error','-y','-i',source,
  '-vf',filter(w,h,preset),'-frames:v','1','-update','1',output]);
}
async function captionOnStill(config,still,destination,title,style='signature-gold'){
 const dir=join(config.outputDir,'poster-work-'+basename(destination).replace(/[^a-z0-9_-]/gi,'-'));
 await mkdir(dir,{recursive:true});
 const base=join(dir,'still.mp4'),final=join(dir,'captioned.mp4'),review=join(dir,'caption-review.json');
 try{
  await run(config,'ffmpeg',['-nostdin','-v','error','-y','-loop','1','-framerate','24','-t','2.5','-i',still,
   '-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p',base]);
  const safe=layoutQuoteForSignatureGold(title);
  await writeFile(review,JSON.stringify({version:1,cues:[{startMs:0,endMs:2450,text:safe,fadeMs:150}],
   captionTiming:'original-creative-copy-not-spoken',authorReviewRequired:true}));
  await burnPersonaSubtitles({videoPath:base,reviewPath:review,outputPath:final,
   ffmpegDir:config.ffmpegDir,preset:style});
  await run(config,'ffmpeg',['-nostdin','-v','error','-y','-ss','1','-i',final,'-frames:v','1','-update','1',destination]);
 }finally{await rm(dir,{recursive:true,force:true})}
}
/** Strict one-to-one author slide ↔ uploaded photo mapping. No auto-fill, repeat, or reordering.
 * null preserves the legacy first-slide title for existing clients.
 */
export function normalizeCarouselSlides(slides,photoCount){
 if(slides==null)return null;
 if(!Number.isSafeInteger(photoCount)||photoCount<1||photoCount>12||
  !Array.isArray(slides)||slides.length!==photoCount)
  throw Error('Each uploaded photo needs exactly one authored slide text');
 return slides.map((slide,i)=>{
  if(!slide||typeof slide!=='object'||Array.isArray(slide)||
   typeof slide.text!=='string'||slide.text!==slide.text.trim())
   throw Error('Slide '+(i+1)+' requires explicit, trimmed text');
  // Validation uses the actual typography layout: two safe lines, not only word count.
  layoutQuoteForSignatureGold(slide.text);
  if(slide.photo!==undefined&&(typeof slide.photo!=='string'||
   slide.photo.length>240||!slide.photo.trim()))
   throw Error('Slide '+(i+1)+' photo direction invalid');
  return {text:slide.text,...(slide.photo!==undefined?{photo:slide.photo}:{})};
 });
}
export async function renderPhotoCarousel({photos,outputDir,aspect='4:5',colorPreset='SoftCinematic',
 title=null,slides=null,textAccents=true,config}){
 const [w,h]=photoOutputSize(aspect);
 if(photos.length<1||photos.length>12)throw Error('Photo carousel needs 1–12 verified photos');
 const authored=normalizeCarouselSlides(slides,photos.length);
 await mkdir(outputDir,{recursive:true});
 const cfg={...config,outputDir};
 const entries=[];
 for(let i=0;i<photos.length;i++){
  const name='photo-'+String(i+1).padStart(2,'0')+'.png';
  const destination=join(outputDir,name),plain=join(outputDir,'plain-'+name);
  await singleFrame(cfg,photos[i],plain,w,h,colorPreset);
  const caption=authored?authored[i].text:(i===0?title:null);
  if(textAccents&&caption){
   await captionOnStill(cfg,plain,destination,caption,'signature-gold');
   await rm(plain,{force:true});
  }else await rename(plain,destination);
  entries.push({id:'photo-'+(i+1),file:name,sha256:await hash(destination),
   bytes:(await stat(destination)).size,width:w,height:h,
   textOverlay:Boolean(textAccents&&caption),captionText:textAccents?caption:null,
   captionSource:authored?'author-slide':i===0&&caption?'legacy-cover-title':'none',
   photoDirection:authored?.[i]?.photo??null});
 }
 const zip=join(outputDir,'carousel.zip');
 await zipImages(entries.map(e=>({path:join(outputDir,e.file),name:e.file})),zip);
 return {kind:'photo-carousel',aspect,width:w,height:h,colorPreset,
  subtitlePreset:'signature-gold',slides:authored,photos:entries,package:{id:'carousel',file:'carousel.zip',
   sha256:await hash(zip),bytes:(await stat(zip)).size},authorReviewRequired:true,
  distributionAllowed:false};
}
// An uncompressed, local ZIP of verified PNGs (no OS-specific zip command).
const crcTable=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0});
const crc=b=>{let c=0xffffffff;for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0};
async function zipImages(files,destination){
 if(files.length>12)throw Error('Too many carousel images');
 const chunks=[],central=[];let offset=0;
 for(const item of files){
  if(!/^photo-\d{2}\.png$/.test(item.name))throw Error('Unsafe ZIP member');
  const raw=await readFile(item.path),name=Buffer.from(item.name);
  if(raw.length>100*1024*1024)throw Error('Carousel image too large for export ZIP');
  const check=crc(raw),local=Buffer.alloc(30),dir=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(check,14);
  local.writeUInt32LE(raw.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
  chunks.push(local,name,raw);
  dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
  dir.writeUInt32LE(check,16);dir.writeUInt32LE(raw.length,20);dir.writeUInt32LE(raw.length,24);
  dir.writeUInt16LE(name.length,28);dir.writeUInt32LE(offset,42);central.push(dir,name);
  offset+=local.length+name.length+raw.length;
 }
 const dirLength=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
 end.writeUInt32LE(dirLength,12);end.writeUInt32LE(offset,16);
 await writeFile(destination,Buffer.concat([...chunks,...central,end]),{flag:'wx'});
}
export async function renderPhotoSlideshow({photos,music=null,outputDir,colorPreset='SoftCinematic',title=null,
 textAccents=true,config}){
 if(photos.length<2||photos.length>12)throw Error('Photo slideshow needs 2–12 photos');
 await mkdir(outputDir,{recursive:true});
 const cfg={...config,outputDir},fps=24,hold=3.4,fade=.6,total=hold*photos.length+fade;
 const args=['-nostdin','-hide_banner','-v','error','-y'];
 for(const file of photos)args.push('-loop','1','-framerate',String(fps),'-t','4','-i',file);
 if(music)args.push('-stream_loop','-1','-i',music);
 const parts=[];
 for(let i=0;i<photos.length;i++){
  parts.push('['+i+':v]'+filter(1080,1920,colorPreset)+',settb=AVTB,setpts=PTS-STARTPTS,fps='+fps+'[p'+i+']');
 }
 let last='p0';
 for(let i=1;i<photos.length;i++){
  const out='x'+i;
  parts.push('['+last+'][p'+i+']xfade=transition=fade:duration='+fade+':offset='+fnum(hold*i)+'['+out+']');
  last=out;
 }
 parts.push('['+last+']format=yuv420p[v]');
 const base=join(outputDir,'slideshow-base.mp4');
 args.push('-filter_complex',parts.join(';'),'-map','[v]');
 if(music)args.push('-map',String(photos.length)+':a:0','-af','afade=t=out:st='+fnum(total-0.8)+':d=0.8',
  '-c:a','aac','-b:a','160k');
 args.push('-t',fnum(total),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p',
  '-movflags','+faststart',base);
 await run(cfg,'ffmpeg',args,{timeoutMs:480000});
 let file=base;
 if(textAccents&&title){
  const review=join(outputDir,'slideshow-caption.json');
  await writeFile(review,JSON.stringify({version:1,cues:[{startMs:600,endMs:3800,
   text:layoutQuoteForSignatureGold(title),fadeMs:150}],captionTiming:'original-creative-copy-not-spoken',
   authorReviewRequired:true}));
  const finished=join(outputDir,'ready.mp4');
  await burnPersonaSubtitles({videoPath:base,reviewPath:review,outputPath:finished,
   ffmpegDir:config.ffmpegDir,preset:'signature-gold'});
  file=finished;
 }else{const finished=join(outputDir,'ready.mp4');await rename(base,finished);file=finished;}
 return {kind:'photo-slideshow',videoName:basename(file),sha256:await hash(file),
  width:1080,height:1920,durationSec:total,colorPreset,hasCaptions:Boolean(textAccents&&title),
  authorReviewRequired:true,distributionAllowed:false};
}
async function findBrightestSecond(config,master,duration){
 // Find the brightest full-second sample by actual pixel luma, not by model intuition.
 const data=await run(config,'ffmpeg',['-nostdin','-hide_banner','-v','error','-i',master,
  '-vf','fps=1,scale=32:32,format=gray','-f','rawvideo','-pix_fmt','gray','pipe:1'],
  {timeoutMs:180000,maxStdout:2*1024*1024});
 const count=Math.floor(data.length/1024);let best=-1,second=0;
 for(let i=0;i<count;i++){
  let score=0;for(let k=i*1024;k<(i+1)*1024;k++)score+=data[k];
  if(score>best){best=score;second=i}
 }
 return {second:Math.min(second,Math.max(0,duration-.1)),samples:count,method:'max-mean-luma-of-one-second-samples'};
}
export async function renderPlatformPackage({videoPath,outputDir,title,colorPreset='SoftCinematic',
 durationSec,config}){
 await mkdir(outputDir,{recursive:true});
 const cfg={...config,outputDir};
 const sourceSha256=await hash(videoPath),entries=[];
 const coverImage=join(outputDir,'cover-source.png');
 const bright=await findBrightestSecond(cfg,videoPath,durationSec);
 await run(cfg,'ffmpeg',['-nostdin','-v','error','-y','-ss',fnum(bright.second),'-i',videoPath,
  '-frames:v','1','-update','1',coverImage]);
 const cover=join(outputDir,'cover.png');
 if(title)await captionOnStill(cfg,coverImage,cover,title,'signature-gold');
 else await copyFile(coverImage,cover);
 await rm(coverImage,{force:true});
 const coverMeta={id:'cover',file:'cover.png',sha256:await hash(cover),bytes:(await stat(cover)).size,
  width:1080,height:1920,brightness:bright};
 entries.push(coverMeta);
 for(const platform of ['instagram','tiktok','youtube']){
  const file=platform+'.mp4',target=join(outputDir,file);
  // All three receive separate, bit-for-bit verified 1080x1920 masters.
  await copyFile(videoPath,target);
  entries.push({id:platform,file,sha256:await hash(target),bytes:(await stat(target)).size,
   width:1080,height:1920,videoCodec:'h264',audioCodec:'aac'});
 }
 for(const [id,vf,height] of [['vk','scale=1080:1920,setsar=1',1920],
  ['vk-4x5','scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',1350]]){
  const path=join(outputDir,id+'.mp4');
  await run(cfg,'ffmpeg',['-nostdin','-v','error','-y','-i',videoPath,
   '-map','0:v:0','-map','0:a?','-vf',vf,'-c:v','libx264','-preset','veryfast',
   '-b:v','4800k','-maxrate','5500k','-bufsize','11000k','-pix_fmt','yuv420p',
   '-c:a','aac','-b:a','160k','-movflags','+faststart',path],{timeoutMs:600000});
  entries.push({id,file:id+'.mp4',sha256:await hash(path),bytes:(await stat(path)).size,
   width:1080,height,videoCodec:'h264',audioCodec:'aac',targetVideoBitrate:'4800k'});
 }
 if(await hash(videoPath)!==sourceSha256)throw Error('Master video changed during platform rendering');
 return {version:1,sourceSha256,entries,cover:coverMeta,authorReviewRequired:true,
  distributionAllowed:false,createdAt:new Date().toISOString()};
}
