import {reviseEditorialPost,type EditorialPost} from './personaEditorialModel';

export const CREATIVE_FEEDBACK_KEY='lifeos:persona:creative-feedback:v1';
export type CreativeFeedback={id:string;postId:string;slideId:string;revision:number;createdAt:string;comment:string;decision:'change-request';status:'pending'|'revision-prepared'};

/** Conservative first adapter: explicit replacement only. Unrecognized artistic
 * requests remain pending, never pretend that an LLM understood them. */
export function prepareCreativeFeedback(post:EditorialPost,slideId:string,raw:string,now=new Date().toISOString()){
 const comment=raw.trim(),slide=post.slides.find(s=>s.id===slideId);
 if(!slide||!comment||comment.length>1500)throw Error('Выбери слайд и напиши замечание (до 1500 символов)');
 let revised:EditorialPost|null=null;
 const match=/^(?:заголовок|новый заголовок|замени заголовок на)\s*[:—-]?\s+([^\n]+)$/iu.exec(comment);
 if(match&&slide.headline===undefined){
  const blocks=slide.text.split(/\n\s*\n/u),headline=match[1].trim().replace(/^«(.+)»$/u,'$1');
  if(headline&&headline.length<=170&&blocks.length>=2){
   const text=[headline,...blocks.slice(1)].join('\n\n');
   if(text.length<=260&&text!==slide.text)revised=reviseEditorialPost(post,{slides:post.slides.map(s=>s.id===slideId?{...s,text}:s)},now);
  }
 }
 const record:CreativeFeedback={id:globalThis.crypto.randomUUID(),postId:post.id,slideId,revision:post.revision,createdAt:now,comment,decision:'change-request',status:revised?'revision-prepared':'pending'};
 return {record,revised};
}
export function loadCreativeFeedback(storage:Pick<Storage,'getItem'>):CreativeFeedback[]{
 const raw=storage.getItem(CREATIVE_FEEDBACK_KEY);if(!raw)return [];
 const data:unknown=JSON.parse(raw);
 if(!Array.isArray(data)||data.some(x=>!x||typeof x.id!=='string'||typeof x.postId!=='string'||typeof x.slideId!=='string'||typeof x.comment!=='string'||!['pending','revision-prepared'].includes(x.status)))throw Error('Журнал замечаний повреждён; существующие данные сохранены');
 return data as CreativeFeedback[];
}
export function appendCreativeFeedback(storage:Pick<Storage,'getItem'|'setItem'>,record:CreativeFeedback):CreativeFeedback[]{
 const records=loadCreativeFeedback(storage);
 if(records.some(x=>x.id===record.id))return records;
 if(records.length>=5000)throw Error('Журнал заполнен; требуется архивирование, данные не удалены');
 const next=[...records,record];storage.setItem(CREATIVE_FEEDBACK_KEY,JSON.stringify(next));return next;
}
