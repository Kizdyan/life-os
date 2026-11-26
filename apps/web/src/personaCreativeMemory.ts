import {applyCreamEditorial,editorialDesignHash,publicationDesignApproved,reviseEditorialPost,type EditorialPost} from './personaEditorialModel';
export const CREATIVE_STYLE_KEY='lifeos:persona:creative-style:v1';
export type CreativeStyle={schemaVersion:1;postId:string;revision:number;designHash:string;recordedAt:string;compositionPreset?:'cream-editorial-v1';preset:'cream'|'chocolate'|'chocolate-graphite';fontPreset:'cormorant-inter'|'literata-golos'|'playfair-inter'};
export function validateCreativeStyle(raw:unknown):CreativeStyle{
 const x=raw as CreativeStyle;
 if(!x||typeof x!=='object'||Array.isArray(x)||x.schemaVersion!==1||typeof x.postId!=='string'||!x.postId||x.postId.length>75||
 !Number.isSafeInteger(x.revision)||x.revision<1||typeof x.designHash!=='string'||!/^fnv1a32:[0-9a-f]{8}$/.test(x.designHash)||
 typeof x.recordedAt!=='string'||!Number.isFinite(Date.parse(x.recordedAt))||
 !['cream','chocolate','chocolate-graphite'].includes(x.preset)||!['cormorant-inter','literata-golos','playfair-inter'].includes(x.fontPreset)||
 (x.compositionPreset!==undefined&&(x.compositionPreset!=='cream-editorial-v1'||x.preset!=='cream'||x.fontPreset!=='literata-golos'))||
 Object.keys(x).some(k=>!['schemaVersion','postId','revision','designHash','recordedAt','preset','fontPreset','compositionPreset'].includes(k)))throw Error('Некорректная творческая память');
 return x;
}
export function loadCreativeStyle(storage:Pick<Storage,'getItem'>):CreativeStyle|null{
 const raw=storage.getItem(CREATIVE_STYLE_KEY);return raw===null?null:validateCreativeStyle(JSON.parse(raw));
}
export function rememberCreativeStyle(storage:Pick<Storage,'setItem'>,post:EditorialPost,now=new Date().toISOString()):CreativeStyle{
 if(post.kind!=='carousel'||post.id==='jaws-old-money-editorial-v1'||!publicationDesignApproved(post)||
 post.approvals.contentHashAtDesignApproval!==editorialDesignHash(post))throw Error('Нужно утверждённое оформление обычной карусели с актуальной контрольной суммой');
 const entry=validateCreativeStyle({schemaVersion:1,postId:post.id,revision:post.revision,designHash:editorialDesignHash(post),recordedAt:now,preset:post.preset,fontPreset:post.fontPreset,...(post.compositionPreset==='cream-editorial-v1'?{compositionPreset:post.compositionPreset}:{})});
 storage.setItem(CREATIVE_STYLE_KEY,JSON.stringify(entry));return entry;
}
/** Apply only to a fresh draft. Do not rewrite old posts, copy approvals, or infer artwork taste. */
export function applyCreativeStyle(post:EditorialPost,style:CreativeStyle|null):EditorialPost{
 if(!style||post.kind!=='carousel'||post.approvals.topic||post.approvals.content||post.approvals.design||post.id==='jaws-old-money-editorial-v1')return post;
 const s=validateCreativeStyle(style);
 return s.compositionPreset==='cream-editorial-v1'?applyCreamEditorial(post):reviseEditorialPost(post,{preset:s.preset,fontPreset:s.fontPreset});
}
export function mergeCreativeStyle(local:CreativeStyle|null,incoming:CreativeStyle|null):CreativeStyle|null{
 if(!incoming)return local;if(!local)return validateCreativeStyle(incoming);
 validateCreativeStyle(local);validateCreativeStyle(incoming);
 if(local.compositionPreset===incoming.compositionPreset&&(Object.keys(local) as (keyof CreativeStyle)[]).every(k=>local[k]===incoming[k]))return local;
 throw Error('Конфликт сохранённого оформления: существующий выбор не заменён');
}
