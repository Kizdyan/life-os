import content from '../../../config/carousel-fridge-hum-v2.json';
import {createFridgeHumCarousel,prepareFridgeHumCarousel} from './personaProductionCarousel';
import {importResearchCarousel} from './personaResearchCarousel';
import {hierarchyCopy} from './personaEditorialTypography';
import type {EditorialPost} from './personaEditorialModel';
import originals from '../public/carousel-backgrounds/fridge-hum-v1/provenance.json';
export const FRIDGE_HUM_V2_ID=content.id;
export function isFridgeHumV2(post:EditorialPost){return [FRIDGE_HUM_V2_ID,FRIDGE_HUM_V2_ID+'-hook-b'].includes(post.id)}
export function createFridgeHumV2(hook:'a'|'b'='a',now='2026-11-22T00:00:00Z'):EditorialPost{
 const selected=content.hooks[hook],hierarchy=[selected,...content.hierarchy.slice(1)];
 const packet={...content.research,slides:content.research.slides.map((s,i)=>i?s:{...s,text:hierarchyCopy({kicker:'',...selected})})};
 const p=importResearchCarousel(content.id+(hook==='b'?'-hook-b':''),JSON.stringify(packet),now),v1=createFridgeHumCarousel();
 return {...p,fontPreset:'cormorant-inter',compositionPreset:'fridge-hum-v2',
  approvals:{...p.approvals,textApproved:false,designApproved:false},
  slides:p.slides.map((s,i)=>({...s,kicker:'',...hierarchy[i],background:{...v1.slides[i].background!,
   generatedRef:p.id+'/'+v1.slides[i].background!.generatedRef!.split('/')[1]}}))};
}
export async function prepareFridgeHumV2(hook:'a'|'b'='a'){return prepareFridgeHumCarousel(createFridgeHumV2(hook))}
export function fridgeHumV2Evidence(post:EditorialPost){
 const signature=(p:EditorialPost)=>JSON.stringify([p.title,p.topic,p.caption,p.slides.map(s=>[s.id,s.text]),p.research?.sourceItems.map(s=>[s.slideId,s.title,s.url])]);
 return {status:signature(post)===signature(createFridgeHumV2(post.id.endsWith('hook-b')?'b':'a'))?'MATCHES_CHECKED_COPY':'NEEDS_RECHECK',
  audit:content.sourceAudit,parentRevision:content.parentRevision,authorApprovalGranted:false,
  artworkReview:'NEEDS_AUTHOR_REVIEW',publicationAllowed:false,
  imageTreatment:post.slides.every((s,i)=>s.background?.sha256===originals[i]?.sha256&&s.background?.provenance?.provider==='codex-imagegen')?
   'Previously generated V1 illustrations; no new generation':'Some backgrounds differ from V1; inspect actual per-slide image-provenance.json',
  treatments:post.compositionPreset==='fridge-hum-v2'?content.visuals:undefined};
}
