import {personaWorkerUrl} from './personaWorkerUrl';
import type {EditorialPost} from './personaEditorialModel';
const dimensions=['readability','hierarchy','composition','brandCoherence','imageRelevance'] as const;
export type VisualDimension=typeof dimensions[number];
export type ReferenceEvidence={assetSha256:string;frameSha256:string;timeSec:number;model:string;preference:'unconfirmed'};
export type VisualOpinion={version:1;provider:'ollama-local';model:string;scope:'single-rendered-slide';sha256:string;index:number;status:'REVISION_SUGGESTED'|'AUTHOR_REVIEW_REQUIRED';approved:false;published:false;referenceEvidence?:ReferenceEvidence[];scores:Record<VisualDimension,number>;issues:{dimension:VisualDimension;severity:'major'|'minor';observation:string;change:string}[];summary:string};
const bounded=(s:unknown,n:number):s is string=>typeof s==='string'&&s.trim().length>0&&s.length<=n;
export function validateVisualReceipt(raw:unknown,index:number,sha256:string):VisualOpinion{
 const x=raw as VisualOpinion;
 if(!x||x.version!==1||x.provider!=='ollama-local'||!bounded(x.model,120)||x.scope!=='single-rendered-slide'||x.index!==index||x.sha256!==sha256||x.approved!==false||x.published!==false||
 !x.scores||Object.keys(x.scores).length!==dimensions.length||!dimensions.every(k=>Number.isInteger(x.scores[k])&&x.scores[k]>=1&&x.scores[k]<=5)||
 !Array.isArray(x.issues)||x.issues.length>5||x.issues.some(i=>!i||!dimensions.includes(i.dimension)||!['major','minor'].includes(i.severity)||!bounded(i.observation,240)||!bounded(i.change,240))||!bounded(x.summary,400))
 throw Error('Некорректное заключение визуального критика');
 if(x.referenceEvidence!==undefined&&(!Array.isArray(x.referenceEvidence)||x.referenceEvidence.length>2||x.referenceEvidence.some(r=>!r||!(/^[a-f0-9]{64}$/.test(r.assetSha256))||!(/^[a-f0-9]{64}$/.test(r.frameSha256))||!Number.isFinite(r.timeSec)||r.timeSec<0||!bounded(r.model,120)||r.preference!=='unconfirmed')))throw Error('Некорректные свидетельства референсов');
 const expected=Object.values(x.scores).some(s=>s<=2)||x.issues.some(i=>i.severity==='major')?'REVISION_SUGGESTED':'AUTHOR_REVIEW_REQUIRED';
 if(x.status!==expected)throw Error('Несогласованный вердикт визуального критика');
 return x;
}
function base64(bytes:Uint8Array){
 let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);
}
export async function reviewRenderedBlob(post:EditorialPost,i:number,png:Blob,signal:AbortSignal):Promise<VisualOpinion>{
 if(post.kind!=='carousel'||post.slides.length<3||post.slides.length>8||!post.slides[i])throw Error('Нужна карусель из 3–8 слайдов');
 signal.throwIfAborted();
 const health=await fetch(personaWorkerUrl+'/health',{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(5000)])});
 if(!health.ok)throw Error('Локальный Worker недоступен');
 const h=await health.json();
 if(h.service!=='persona-media-worker'||typeof h.token!=='string')throw Error('Локальный Worker не подтверждён');
 const slide=post.slides[i];
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
export async function reviewRenderedSlide(post:EditorialPost,i:number,signal:AbortSignal):Promise<VisualOpinion>{
 if(post.kind!=='carousel'||!post.slides[i])throw Error('Слайд не найден');
 signal.throwIfAborted();
 const {renderEditorialSlide}=await import('./personaEditorialMedia');
 return reviewRenderedBlob(post,i,await renderEditorialSlide(post,post.slides[i],i),signal);
}
export async function reviewRenderedCarousel(post:EditorialPost,options:{signal:AbortSignal;onSlide:(receipt:VisualOpinion)=>void}){
 if(post.kind!=='carousel'||post.slides.length<3||post.slides.length>8)throw Error('Нужна карусель из 3–8 слайдов');
 for(const [i] of post.slides.entries())options.onSlide(await reviewRenderedSlide(post,i,options.signal));
}

/** A partial critic result never counts as a complete review. */
export function summarizeVisualPackage(receipts:VisualOpinion[],expectedSlides:number,blocked:string|null){
 if(!Number.isInteger(expectedSlides)||expectedSlides<3||expectedSlides>8||receipts.length>expectedSlides||
  receipts.some((r,i)=>r.index!==i+1))throw Error('Некорректная последовательность проверки');
 return {status:blocked||receipts.length!==expectedSlides?'BLOCKED':receipts.some(r=>r.status==='REVISION_SUGGESTED')?'REVISION_SUGGESTED':'AUTHOR_REVIEW_REQUIRED',
  blocked:blocked??(receipts.length!==expectedSlides?'Проверены не все слайды':null),expectedSlides,receipts,approved:false,published:false};
}
