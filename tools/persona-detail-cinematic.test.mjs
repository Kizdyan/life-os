import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getVisualPreset} from './persona-creative-director.mjs';
import {renderVisualPreset} from './persona-color-variants.mjs';

const available=spawnSync('ffmpeg',['-version']).status===0&&spawnSync('ffprobe',['-version']).status===0;
const W=320,H=568;
const REFERENCE='eq=contrast=1.045:saturation=0.985:gamma=1.01,colorbalance=rs=-0.008:bs=0.012:rm=0.004:gm=-0.002:bm=-0.003:pl=0';
const DETAIL=REFERENCE+',unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.20:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.0';
function ffmpeg(args){
 const result=spawnSync('ffmpeg',['-hide_banner','-nostdin','-v','error',...args],{maxBuffer:W*H*4,timeout:120000});
 assert.equal(result.status,0,result.stderr?.toString());
 return result.stdout;
}
function rgb(path,filter=null){
 const raw=ffmpeg(['-i',path,...(filter?['-vf',filter]:[]),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
 assert.equal(raw.length,W*H*3);
 return raw;
}
function pixel(frame,x,y){const i=(y*W+x)*3;return [frame[i],frame[i+1],frame[i+2]];}
function averageRgb(frame,x0,y0,x1,y1){
 const channels=[0,0,0];let n=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const i=(y*W+x)*3;for(let c=0;c<3;c++)channels[c]+=frame[i+c];n++;
 }
 return channels.map(v=>v/n);
}
function luma(frame,x,y){const p=pixel(frame,x,y);return (p[0]+p[1]+p[2])/3;}
function edgeEnergy(frame,x0,y0,x1,y1){
 let total=0,count=0;
 for(let y=y0;y<y1-1;y++)for(let x=x0;x<x1-1;x++){
  const cur=luma(frame,x,y);
  total+=Math.abs(cur-luma(frame,x+1,y))+Math.abs(cur-luma(frame,x,y+1));count+=2;
 }
 return total/count;
}
function haloDelta(baseline,graded,x0,y0,x1,y1){
 let largest=0;
 for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)largest=Math.max(largest,Math.abs(luma(baseline,x,y)-luma(graded,x,y)));
 return largest;
}

test('Detail Cinematic: preserves chroma, skin-tone control, garment texture and bounded edge sharpening in MP4',{skip:!available,timeout:120000},async()=>{
 const preset=getVisualPreset('DetailCinematic');
 assert.equal(preset.name,'Detail Cinematic');
 assert.equal(preset.filter,DETAIL,'approved color and sharpness guardrails must not silently change');
 assert.match(preset.filter,/:pl=0(?:,|$)/,'pl=1 can turn saturated red monochrome in FFmpeg');
 const root=await mkdtemp(join(tmpdir(),'persona-detail-cinematic-'));
 try{
  const source=join(root,'source.mp4'),graded=join(root,'graded.mp4');
  // Synthetic skin-tone swatch and textile grid are controls, NOT human skin validation.
  ffmpeg(['-f','lavfi','-i',
   'testsrc2=s=320x568:r=30:d=0.8,drawbox=x=20:y=20:w=100:h=95:color=red:t=fill,drawbox=x=150:y=70:w=95:h=165:color=0xbd8e75:t=fill,drawbox=x=125:y=340:w=120:h=150:color=0x444d58:t=fill,drawgrid=width=5:height=7:thickness=1:color=0x7a8192@0.25',
   '-f','lavfi','-i','sine=frequency=440:duration=0.8','-c:v','libx264','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-shortest','-y',source]);
  const before=await readFile(source);
  const receipt=await renderVisualPreset({inputPath:source,outputPath:graded,presetId:'DetailCinematic'});
  assert.equal(receipt.presetId,'DetailCinematic');assert.equal(receipt.filter,DETAIL);
  assert.deepEqual(await readFile(source),before,'original must remain byte-identical');
  assert.equal(receipt.publicationApproved,false);
  const base=rgb(source,REFERENCE),detail=rgb(source,DETAIL),actualMp4=rgb(graded);
  const red=averageRgb(actualMp4,30,40,100,100),skin=averageRgb(actualMp4,165,100,230,210);
  assert.ok(red[0]-red[1]>90&&red[0]-red[2]>90,'saturated red became neutral gray');
  assert.ok(skin[0]>skin[1]+10&&skin[1]>skin[2]+6,'skin-tone swatch became neutral or channels shifted');
  const originalSkin=averageRgb(base,165,100,230,210);
  assert.ok(skin.every((channel,i)=>Math.abs(channel-originalSkin[i])<9),'skin-tone swatch shifted strongly during sharpening');
  const clothGain=edgeEnergy(detail,135,350,240,485)/edgeEnergy(base,135,350,240,485);
  assert.ok(clothGain>1.04,'garment-like textile contrast did not improve');
  const strandGain=edgeEnergy(detail,45,250,310,330)/edgeEnergy(base,45,250,310,330);
  assert.ok(strandGain>1.04,'strand-like fine texture did not improve');
  const skinGain=edgeEnergy(detail,163,100,235,210)/edgeEnergy(base,163,100,235,210);
  assert.ok(skinGain<1.30,'skin-like patch microcontrast increased excessively (noise risk)');
  const halo=haloDelta(base,detail,145,110,156,200);
  assert.ok(halo<12,'luma overshoot near skin-like swatch edge is too large');
  // Verify that the originally requested 0.35 really is harsher on this control.
  const oversharp=rgb(source,DETAIL.replace('luma_amount=0.20','luma_amount=0.35'));
  const oversharpSkinGain=edgeEnergy(oversharp,163,100,235,210)/edgeEnergy(base,163,100,235,210);
  assert.ok(oversharpSkinGain>skinGain+0.04,'unsafe 0.35 must measurably amplify fine skin-like noise');
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Detail Cinematic: pure saturated-red FFmpeg signal keeps color with pl=0',{skip:!available},()=>{
 const preset=getVisualPreset('DetailCinematic');
 const raw=ffmpeg(['-f','lavfi','-i','testsrc2=s=320x568:r=30:d=0.5','-vf',preset.filter,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-']);
 const red=pixel(raw,20,100);
 assert.ok(Math.max(...red)-Math.min(...red)>100,'FFmpeg turned saturated red gray');
});
