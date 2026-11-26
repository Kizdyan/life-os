import {reviseEditorialPost,validBrandTrialStyle,type EditorialPost} from './personaEditorialModel';
import {personaWorkerUrl} from './personaWorkerUrl';
import {brandTrialArt,isLocalBrandTrialSlide} from './personaJawsBrandTrial';

export const CREATIVE_FEEDBACK_KEY='lifeos:persona:creative-feedback:v1';
export type CreativeFeedback={id:string;postId:string;slideId:string;revision:number;createdAt:string;comment:string;decision:'change-request';status:'pending'|'revision-prepared';scope?:'brand'};

/** Conservative first adapter: explicit replacement only. Unrecognized artistic
 * requests remain pending, never pretend that an LLM understood them. */
export function prepareCreativeFeedback(post:EditorialPost,slideId:string,raw:string,now=new Date().toISOString(),scope?:'brand'){
 const comment=raw.trim(),slide=post.slides.find(s=>s.id===slideId);
 if(!slide||!comment||comment.length>1500)throw Error('Выбери слайд и напиши замечание (до 1500 символов)');
 if(scope==='brand'&&comment.length>600)throw Error('Общее пожелание должно содержать не более 600 символов');
 let revised:EditorialPost|null=null;
 const match=/^(?:заголовок|новый заголовок|замени заголовок на)\s*[:—-]?\s+([^\n]+)$/iu.exec(comment);
 if(match&&slide.headline===undefined){
  const blocks=slide.text.split(/\n\s*\n/u),headline=match[1].trim().replace(/^«(.+)»$/u,'$1');
  if(headline&&headline.length<=170&&blocks.length>=2){
   const text=[headline,...blocks.slice(1)].join('\n\n');
   if(text.length<=260&&text!==slide.text)revised=reviseEditorialPost(post,{slides:post.slides.map(s=>s.id===slideId?{...s,text}:s)},now);
  }
 }
 const record:CreativeFeedback={id:globalThis.crypto.randomUUID(),postId:post.id,slideId,revision:post.revision,createdAt:now,comment,decision:'change-request',status:revised?'revision-prepared':'pending',...(scope==='brand'?{scope}: {})};
 return {record,revised};
}
export function validateCreativeFeedback(data:unknown):CreativeFeedback[]{
 if(!Array.isArray(data)||data.length>5000||data.some(x=>!x||typeof x.id!=='string'||!x.id||x.id.length>100||
  typeof x.postId!=='string'||!x.postId||x.postId.length>75||typeof x.slideId!=='string'||!x.slideId||x.slideId.length>100||
  typeof x.comment!=='string'||!x.comment.trim()||x.comment.length>1500||!Number.isSafeInteger(x.revision)||x.revision<1||
  typeof x.createdAt!=='string'||!Number.isFinite(Date.parse(x.createdAt))||x.decision!=='change-request'||
  !['pending','revision-prepared'].includes(x.status)||(x.scope!==undefined&&x.scope!=='brand')||Object.keys(x).some(k=>!['id','postId','slideId','revision','createdAt','comment','decision','status','scope'].includes(k)))||
  new Set(data.map(x=>x.id)).size!==data.length)throw Error('Журнал замечаний повреждён; существующие данные сохранены');
 return data as CreativeFeedback[];
}
export function mergeCreativeFeedback(local:CreativeFeedback[],incoming:CreativeFeedback[]):CreativeFeedback[]{
 const byId=new Map(validateCreativeFeedback(local).map(r=>[r.id,r]));
 for(const r of validateCreativeFeedback(incoming)){
  const old=byId.get(r.id);
  if(old){
   if((['id','postId','slideId','revision','createdAt','comment','decision','status','scope'] as const).some(k=>old[k]!==r[k]))throw Error('Конфликт записи творческой правки '+r.id);
  }else byId.set(r.id,r);
 }
 return validateCreativeFeedback([...byId.values()]);
}
export function loadCreativeFeedback(storage:Pick<Storage,'getItem'>):CreativeFeedback[]{
 const raw=storage.getItem(CREATIVE_FEEDBACK_KEY);if(raw===null)return [];
 return validateCreativeFeedback(JSON.parse(raw));
}
export function appendCreativeFeedback(storage:Pick<Storage,'getItem'|'setItem'>,record:CreativeFeedback):CreativeFeedback[]{
 const records=loadCreativeFeedback(storage);
 if(records.some(x=>x.id===record.id))return records;
 if(records.length>=5000)throw Error('Журнал заполнен; требуется архивирование, данные не удалены');
 const next=[...records,record];storage.setItem(CREATIVE_FEEDBACK_KEY,JSON.stringify(next));return next;
}

export function applyCreativeModelPatch(post:EditorialPost,slideId:string,raw:unknown):EditorialPost|null{
 const slide=post.slides.find(s=>s.id===slideId);
 if(!slide||!isLocalBrandTrialSlide(post,slide)||!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Недопустимая модельная правка');
 const {text,...style}=raw as Record<string,unknown>;
 if(!Object.keys(raw).length||!validBrandTrialStyle(style))throw Error('Недопустимые параметры оформления');
 if(text!==undefined&&(typeof text!=='string'||!text.trim()||text.length>260||text.trim().split(/\n\s*\n/u).filter(Boolean).length>3||/\bpersona\b|персона|Константин\s+Умрихин/iu.test(text)))throw Error('Недопустимый текст правки');
 const next={...slide,text:typeof text==='string'?text.trim():slide.text,brandTrialStyle:{...slide.brandTrialStyle,...style}};
 if(next.text===slide.text&&Object.entries(next.brandTrialStyle).every(([k,v])=>Object.entries(slide.brandTrialStyle??{}).some(([a,b])=>a===k&&b===v)))return null;
 return reviseEditorialPost(post,{slides:post.slides.map(s=>s.id===slideId?next:s)});
}
/** Only explicitly global author requests are reusable. Prepared is not approved. */
export function creativeBrandNotes(records:CreativeFeedback[],excludeId?:string):string[]{
 const seen=new Set<string>(),result:string[]=[];let chars=0;
 for(const r of [...validateCreativeFeedback(records)].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))){
  if(r.scope!=='brand'||r.id===excludeId)continue;
  const note=r.comment.trim();const key=note.toLocaleLowerCase('ru').replace(/\s+/g,' ');
  if(seen.has(key)||note.length>600||chars+note.length>2400)continue;
  seen.add(key);result.push(note);chars+=note.length;if(result.length===6)break;
 }
 return result;
}
export async function requestCreativeModelPatch(post:EditorialPost,slideId:string,comment:string,brandNotes:string[]=[]){
 const slide=post.slides.find(s=>s.id===slideId);
 if(!slide||!isLocalBrandTrialSlide(post,slide))throw Error('Модельные правки пока доступны только в локальном бренд-тесте');
 const index=post.slides.indexOf(slide),spec=brandTrialArt(slideId);
 const health=await fetch(personaWorkerUrl+'/health',{signal:AbortSignal.timeout(5000)});
 if(!health.ok)throw Error('Локальный Worker недоступен');
 const h=await health.json();
 if(typeof h.token!=='string'||!h.token)throw Error('Нет токена локального Worker');
 const response=await fetch(personaWorkerUrl+'/carousel-creative-revision',{method:'POST',headers:{'Content-Type':'application/json','X-Persona-Worker-Token':h.token},body:JSON.stringify({topic:post.topic,text:slide.text,comment,brandNotes,style:{palette:spec.palette,layout:index===0?'image-bottom':index%2===1?'image-top':'image-middle',font:'classic',image:'normal',...slide.brandTrialStyle}}),signal:AbortSignal.timeout(100000)});
 if(!response.ok)throw Error('Worker не выполнил правку: '+response.status);
 const result=await response.json();
 if(result?.provider!=='ollama-local'||typeof result.model!=='string')throw Error('Нет подтверждения ответа локальной модели');
 if(result.status==='unsupported')return {revised:null,message:typeof result.reason==='string'?result.reason:'Правка пока не поддерживается'};
 if(result.status!=='patch')throw Error('Некорректный ответ модели');
 return {revised:applyCreativeModelPatch(post,slideId,result.patch),message:'Получен черновик правки от '+result.model};
}
export function markCreativeFeedbackPrepared(storage:Pick<Storage,'getItem'|'setItem'>,id:string):CreativeFeedback[]{
 const records=loadCreativeFeedback(storage);
 if(!records.some(r=>r.id===id))throw Error('Запись замечания не найдена');
 const next=records.map(r=>r.id===id?{...r,status:'revision-prepared' as const}:r);
 storage.setItem(CREATIVE_FEEDBACK_KEY,JSON.stringify(next));return next;
}
