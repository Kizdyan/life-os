/** Publication packaging only: no new editorial entity, approval workflow or platform posting. */
import {
 CAROUSEL_BASELINE_ID,CAROUSEL_002_ID,CAROUSEL_003_ID,CAROUSEL_004_ID,
 createBaselinePauseCarousel,createDirectorQuestionCarousel,createPhotoArchiveCarousel,
 createMixedNarrativeCarousel,editorialChecklistReady,editorialChecklistState,
 editorialContentHash,validatePost,type EditorialPost,type EditorialSlide
} from './personaEditorialModel';
import {renderEditorialSlide,verifyEditorialArchivePhotos,zipFileBytes} from './personaEditorialMedia';

export const PUBLICATION_CAROUSEL_IDS=[
 CAROUSEL_BASELINE_ID,CAROUSEL_002_ID,CAROUSEL_003_ID,CAROUSEL_004_ID
] as const;
export type PublicationCarouselId=typeof PUBLICATION_CAROUSEL_IDS[number];
export const UNAPPROVED_PUBLICATION_MESSAGE='Карусель не утверждена. Пройдите чек-лист и нажмите "Утвердить"';
export type PublicationZipEntry={name:string;data:Uint8Array};
export type PublicationSlideRenderer=(post:EditorialPost,slide:EditorialSlide,index:number)=>Promise<Blob>;

export function publicationCarouselDraft(id:PublicationCarouselId):EditorialPost{
 switch(id){
  case CAROUSEL_BASELINE_ID:return createBaselinePauseCarousel();
  case CAROUSEL_002_ID:return createDirectorQuestionCarousel();
  case CAROUSEL_003_ID:return createPhotoArchiveCarousel();
  case CAROUSEL_004_ID:return createMixedNarrativeCarousel();
 }
}
export function publicationCarouselApproved(post:EditorialPost|undefined):boolean{
 if(!post||!PUBLICATION_CAROUSEL_IDS.includes(post.id as PublicationCarouselId))return false;
 try{
  validatePost(post);
  const approval=post.approvals;
  return post.kind==='carousel'&&post.slides.length===6&&
   approval.topic&&approval.content&&approval.design&&
   editorialChecklistReady(post)&&
   approval.checklist?.length===7&&approval.checklist.every(Boolean)===true&&
   Boolean(approval.checkedAt&&approval.checkedBy)&&
   approval.contentHashAtApproval===editorialContentHash(post);
 }catch{return false}
}
function requireApproval(post:EditorialPost):void{
 if(!publicationCarouselApproved(post))throw Error(UNAPPROVED_PUBLICATION_MESSAGE);
}
export function publicationIsTextFallback(post:EditorialPost):boolean{
 return Boolean(post.carouselFormat&&post.slides.some(s=>s.visual==='background'));
}
export function publicationInstructions(post:EditorialPost):string{
 const lines=[
  'Откройте Instagram и создайте публикацию-карусель.',
  'Загрузите slide-01.png — slide-06.png в указанном порядке.',
  'Вставьте текст из caption.txt в подпись и опубликуйте вручную после личной проверки.'
 ];
 if(publicationIsTextFallback(post))
  lines.push('Это текстовая версия. Чтобы добавить фотографии, выберите их в архиве Persona и утвердите заново.');
 return lines.join('\n')+'\n';
}
export function publicationDate(date=new Date()):string{
 if(!Number.isFinite(date.getTime()))throw Error('Недопустимая дата');
 const pad=(n:number)=>String(n).padStart(2,'0');
 return [date.getFullYear(),pad(date.getMonth()+1),pad(date.getDate())].join('-');
}
export function publicationFilename(id:PublicationCarouselId|null,date=new Date()):string{
 return (id??'persona-carousels')+'-publish-'+publicationDate(date)+'.zip';
}
export function publicationChecklistJson(post:EditorialPost):string{
 requireApproval(post);
 return JSON.stringify({
  kind:'persona-carousel-publication-checklist-v1',
  carouselId:post.id,status:'approved',published:false,
  slideCount:post.slides.length,format:post.carouselFormat??'text-only',
  textFallback:publicationIsTextFallback(post),
  checkedAt:post.approvals.checkedAt,checkedBy:post.approvals.checkedBy,
  contentHashAtApproval:post.approvals.contentHashAtApproval,
  checks:editorialChecklistState(post).map((pass,index)=>({item:index+1,pass}))
 },null,2)+'\n';
}
async function assertAvailable(post:EditorialPost):Promise<void>{
 requireApproval(post);
 if(post.carouselFormat&&!(await verifyEditorialArchivePhotos(post)))
  throw Error('Пункт 6: исходные фотографии отсутствуют в архиве Persona. Выберите фото и утвердите заново.');
}
/** Produces exactly 9 files in one carousel folder, with original Canvas PNG rendering. */
export async function publicationEntries(post:EditorialPost,
 renderer:PublicationSlideRenderer=renderEditorialSlide):Promise<PublicationZipEntry[]>{
 await assertAvailable(post);
 const encode=(value:string)=>new TextEncoder().encode(value);
 const entries:PublicationZipEntry[]=[];
 for(const [index,slide] of post.slides.entries()){
  const png=await renderer(post,slide,index);
  if(png.type!=='image/png')throw Error('PNG-экспорт вернул неверный формат');
  const bytes=new Uint8Array(await png.arrayBuffer());
  entries.push({name:post.id+'/slide-'+String(index+1).padStart(2,'0')+'.png',data:bytes});
 }
 entries.push({name:post.id+'/caption.txt',data:encode(post.caption.trim())});
 entries.push({name:post.id+'/publish-instructions.txt',data:encode(publicationInstructions(post))});
 entries.push({name:post.id+'/checklist.json',data:encode(publicationChecklistJson(post))});
 return entries;
}
export async function buildSinglePublicationZip(post:EditorialPost,
 renderer:PublicationSlideRenderer=renderEditorialSlide):Promise<Blob>{
 requireApproval(post);
 return zipFileBytes(await publicationEntries(post,renderer));
}
export async function buildAllPublicationZip(posts:readonly EditorialPost[],
 renderer:PublicationSlideRenderer=renderEditorialSlide):Promise<Blob>{
 // Preflight *every* approval before rendering anything or beginning any download.
 if(posts.length!==PUBLICATION_CAROUSEL_IDS.length||
    new Set(posts.map(p=>p.id)).size!==PUBLICATION_CAROUSEL_IDS.length||
    PUBLICATION_CAROUSEL_IDS.some(id=>!posts.some(p=>p.id===id)))
  throw Error(UNAPPROVED_PUBLICATION_MESSAGE);
 posts.forEach(requireApproval);
 const ordered=PUBLICATION_CAROUSEL_IDS.map(id=>posts.find(p=>p.id===id)!);
 for(const post of ordered)await assertAvailable(post);
 const entries:PublicationZipEntry[]=[];
 for(const post of ordered)entries.push(...await publicationEntries(post,renderer));
 return zipFileBytes(entries);
}
