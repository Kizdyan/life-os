import {personaWorkerUrl} from './personaWorkerUrl';
import type {EditorialPost} from './personaEditorialModel';
import {renderEditorialSlide} from './personaEditorialMedia';
const dimensions=['readability','hierarchy','composition','brandCoherence','imageRelevance'] as const;
export type VisualDimension=typeof dimensions[number];
export type VisualOpinion={version:1;provider:'ollama-local';model:string;scope:'single-rendered-slide';sha256:string;index:number;status:'REVISION_SUGGESTED'|'AUTHOR_REVIEW_REQUIRED';approved:false;published:false;scores:Record<VisualDimension,number>;issues:{dimension:VisualDimension;severity:'major'|'minor';observation:string;change:string}[];summary:string};
const bounded=(s:unknown,n:number):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
export function validateVisualReceipt(raw:unknown,index:number,sha256:string):VisualOpinion{
 const x=raw as VisualOpinion;
 if(!x||x.version!==1||x.provider!=='ollama-local'||!bounded(x.model,120)||x.scope!=='single-rendered-slide'||x.index!==index||x.sha256!==sha256||x.approved!==false||x.published!==false||
 !x.scores||Object.keys(x.scores).length!==dimensions.length||!dimensions.every(k=>Number.isInteger(x.scores[k])&&x.scores[k]>=1&&x.scores[k]<=5)||
 !Array.isArray(x.issues)||x.issues.length>5||x.issues.some(i=>!i||!dimensions.includes(i.dimension)||!['major','minor'].includes(i.severity)||!bounded(i.observation,240)||!bounded(i.change,240))||!bounded(x.summary,400))
 throw Error('Некорректное заключение визуального критика');
 const expected=Object.values(x.scores).some(s=>s<=2)||x.issues.some(i=>i.severity==='major')?'REVISION_SUGGESTED':'AUTHOR_REVIEW_REQUIRED';
 if(x.status!==expected)throw Error('Несогласованный вердикт визуального критика');
 return x;
}
function base64(bytes:Uint8Array){
 let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);
}
export async function reviewRenderedSlide(post:EditorialPost,i:number,signal:AbortSignal):Promise<VisualOpinion>{
 if(post.kind!=='carousel'||post.slides.length<3||post.slides.length>8||!post.slides[i])throw Error('Нужна карусель из 3–8 слайдов');
 signal.throwIfAborted();
 const health=await fetch(personaWorkerUrl+'/health',{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
 if(!health.ok)throw Error('Локальный Worker недоступен');
 const h=await health.json();
 if(h.service!=='persona-media-worker'||typeof h.token!=='string')throw Error('Локальный Worker не подтверждён');
 const slide=post.slides[i],png=await renderEditorialSlide(post,slide,i);
 if(png.type!=='image/png'||png.size<1000||png.size>8*1024*1024)throw Error('PNG вне допустимого размера: слайд '+(i+1));
 const bytes=new Uint8Array(await png.arrayBuffer());
 const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
 signal.throwIfAborted();
 const response=await fetch(personaWorkerUrl+'/carousel-visual-review',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':h.token},
  body:JSON.stringify({topic:post.topic,text:slide.text,index:i+1,total:post.slides.length,png:base64(bytes),sha256}),
  signal:AbortSignal.any([signal,AbortSignal.timeout(210000)])});
 if(!response.ok){const e=await response.json().catch(()=>null);throw Error(typeof e?.error==='string'?e.error:'Визуальная проверка не выполнена: '+response.status)}
 const receipt=validateVisualReceipt(await response.json(),i+1,sha256);
 signal.throwIfAborted();return receipt;
}
export async function reviewRenderedCarousel(post:EditorialPost,options:{signal:AbortSignal;onSlide:(receipt:VisualOpinion)=>void}){
 if(post.kind!=='carousel'||post.slides.length<3||post.slides.length>8)throw Error('Нужна карусель из 3–8 слайдов');
 for(const [i] of post.slides.entries())options.onSlide(await reviewRenderedSlide(post,i,options.signal));
}
