import type {EditorialSlide} from './personaEditorialModel';
import {wrapEditorialText} from './personaEditorialTypography';
export const CREAM_EDITORIAL_VERSION='cream-editorial-render-v1';
/** Keep the original wording. Use authored hierarchy when present, otherwise split only on paragraph boundaries. */
export function creamEditorialCopy(slide:EditorialSlide){
 if(slide.headline!==undefined)return {kicker:slide.kicker??'',headline:slide.headline,body:[slide.highlight,slide.body].filter(Boolean).join('\n\n')};
 const parts=slide.text.trim().split(/\n\s*\n/u);
 return {kicker:'',headline:parts[0],body:parts.slice(1).join('\n\n')};
}
export async function renderCreamEditorial(slide:EditorialSlide,index:number,blob:Blob):Promise<Blob>{
 const copy=creamEditorialCopy(slide);
 const fonts=await Promise.all([document.fonts.load('600 84px "Persona Editorial Literata"',copy.headline),
  document.fonts.load('400 42px "Persona Editorial Golos"',copy.kicker+' '+copy.body+' Искусство')]);
 if(fonts.some(f=>!f.length))throw Error('Не загружены шрифты Cream Editorial');
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const c=canvas.getContext('2d');if(!c)throw Error('Canvas недоступен');
 c.fillStyle='#E9DDC9';c.fillRect(0,0,1080,1350);
 // Deterministic fine paper grain, not a generated photograph.
 let seed=431;for(let i=0;i<22000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%1080;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed%1350;c.fillStyle=i%2?'rgba(62,40,21,.035)':'rgba(255,255,255,.09)';c.fillRect(x,y,2,2)}
 const fit=(value:string,x:number,y:number,w:number,h:number,max:number,min:number,family:string,weight:number,leading:number)=>{
  if(!value.trim())return;
  for(let size=max;size>=min;size-=2){
   c.font=weight+' '+size+'px "'+family+'"';let lines:string[];
   try{lines=wrapEditorialText(value,w,s=>c.measureText(s).width)}catch{continue}
   const step=Math.ceil(size*leading);
   if(lines.length*step>h)continue;
   c.textBaseline='top';for(const [i,line] of lines.entries())c.fillText(line,x,y+i*step);
   return;
  }
  throw Error('Текст не помещается в Cream Editorial: сократите формулировку, не обрезая смысл.');
 };
 // Keep image windows and type hierarchy stable; alternate image height with content density.
 const top=copy.kicker?126:80,headerEnd=index===0?565:505,bodyHeight=copy.body?(index%2?288:245):70,imageEnd=1350-bodyHeight;
 c.fillStyle='#352319';
 if(copy.kicker)fit(copy.kicker,64,46,952,48,31,22,'Persona Editorial Golos',400,1.2);
 c.fillStyle='#847950';c.fillRect(64,copy.kicker?102:49,952,2);
 c.fillStyle='#352319';fit(copy.headline,64,top,952,headerEnd-top-32,106,46,'Persona Editorial Literata',600,1.13);
 const image=await createImageBitmap(blob);
 try{
  const height=imageEnd-headerEnd,scale=Math.max(1080/image.width,height/image.height);
  c.save();c.beginPath();c.rect(0,headerEnd,1080,height);c.clip();
  c.drawImage(image,(1080-image.width*scale)/2,headerEnd+(height-image.height*scale)/2,image.width*scale,image.height*scale);c.restore();
 }finally{image.close()}
 c.fillStyle='#352319';fit(copy.body,64,imageEnd+28,952,bodyHeight-56,43,28,'Persona Editorial Golos',400,1.27);
 return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG не создан')),'image/png'));
}
