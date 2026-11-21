import content from '../../../config/carousel-fridge-hum.json';
import images from '../public/carousel-backgrounds/fridge-hum-v1/provenance.json';
import {importResearchCarousel} from './personaResearchCarousel';
import {hierarchyCopy} from './personaEditorialTypography';
import {readEditorialImageByRef,saveEditorialImage} from './personaEditorialMedia';
import type {EditorialPost} from './personaEditorialModel';
export const FRIDGE_HUM_ID=content.id;
export const fridgeHumSourceAudit=content.sourceAudit;
export function fridgeHumSourceEvidence(post:EditorialPost){
 const signature=(p:EditorialPost)=>JSON.stringify([p.title,p.topic,p.caption,p.slides.map(s=>[s.id,s.text]),
  p.research?.sourceItems.map(s=>[s.slideId,s.title,s.url])]);
 return {status:signature(post)===signature(createFridgeHumCarousel())?'MATCHES_CHECKED_COPY':'NEEDS_RECHECK',
  checkedCopyId:FRIDGE_HUM_ID,audit:fridgeHumSourceAudit,authorApprovalGranted:false};
}

/** A real authored production draft, not approved copy and not a V14 replacement. */
export function createFridgeHumCarousel(now?:string):EditorialPost{
 const post=importResearchCarousel(content.id,JSON.stringify(content.research),now);
 return {...post,fontPreset:'cormorant-inter',approvals:{...post.approvals,textApproved:false,designApproved:false},
  slides:post.slides.map((slide,i)=>{
   const h={kicker:'',...content.hierarchy[i]},asset=images[i];
   if(hierarchyCopy(h)!==slide.text)throw Error('Production copy differs from sourced research');
   return {...slide,...h,background:{libraryId:'empty-stage',generatedRef:post.id+'/bg-fridge-'+asset.sha256.slice(0,24),sha256:asset.sha256,
    provenance:{provider:'codex-imagegen',model:asset.model,prompt:asset.prompt,createdAt:asset.createdAt}}};
  })};
}

/** Import actual new tool-generated images into the existing immutable local media store.
 * This performs local asset reads, NOT a live image-provider request. */
export async function prepareFridgeHumCarousel():Promise<EditorialPost>{
 const post=createFridgeHumCarousel();
 for(const [i,asset] of images.entries()){
  const bg=post.slides[i].background!,response=await fetch('/carousel-backgrounds/fridge-hum-v1/'+asset.file);
  if(!response.ok)throw Error('Не найдена иллюстрация '+(i+1));
  const blob=await response.blob();
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!==asset.sha256)throw Error('SHA-256 иллюстрации '+(i+1)+' не совпадает');
  const existing=await readEditorialImageByRef(bg.generatedRef!);
  if(existing){
   const stored=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await existing.blob.arrayBuffer()))).map(v=>v.toString(16).padStart(2,'0')).join('');
   if(stored!==digest)throw Error('Сохранённая иллюстрация изменена; оригинал не перезаписан');
  }else await saveEditorialImage(post.id,bg.generatedRef!.split('/')[1],new File([blob],asset.file,{type:'image/jpeg'}));
 }
 return post;
}
