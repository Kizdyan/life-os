import {personaWorkerUrl} from './personaWorkerUrl';
import {validatePost,type EditorialPost} from './personaEditorialModel';
import {saveEditorialImage,readEditorialImageByRef} from './personaEditorialMedia';
const categories=['portrait','screen','stage','music','editorial'] as const;
type Category=typeof categories[number];
type Asset={sha256:string;category:Category;score:number;name:string};
export type AboutMePackage={version:1;id:string;status:'AUTHOR_REVIEW_REQUIRED';checkpointSha256:string;scoresReused:number;modelCalls:0;assets:Asset[];missingCategories:Category[];publicationApproved:false};
const digest=/^[a-f0-9]{64}$/;
export function validateAboutMePackage(raw:unknown):AboutMePackage{
 const x=raw as AboutMePackage;
 if(!x||x.version!==1||!(/^[a-f0-9-]{36}$/.test(x.id))||x.status!=='AUTHOR_REVIEW_REQUIRED'||!digest.test(x.checkpointSha256)||!Number.isSafeInteger(x.scoresReused)||x.scoresReused<1||x.modelCalls!==0||x.publicationApproved!==false||
 !Array.isArray(x.assets)||x.assets.length>10||x.assets.some(a=>!a||!digest.test(a.sha256)||!categories.includes(a.category)||!Number.isFinite(a.score)||a.score<6||a.score>10||typeof a.name!=='string'||!a.name.trim()||a.name.length>255)||
 new Set(x.assets.map(a=>a.sha256)).size!==x.assets.length||!Array.isArray(x.missingCategories)||x.missingCategories.some(k=>!categories.includes(k)))throw Error('Некорректный пакет «Обо мне»');
 return x;
}
const texts:Record<Category,string>={portrait:'Обо мне',screen:'Кино',stage:'Театр',music:'Музыка',editorial:'За пределами сцены'};
export function buildAboutMeDraft(id:string,pkg:AboutMePackage,available:readonly string[],now=new Date().toISOString()):EditorialPost{
 validateAboutMePackage(pkg);
 const selected=categories.flatMap(category=>pkg.assets.filter(a=>a.category===category&&available.includes(a.sha256)).sort((a,b)=>b.score-a.score||a.sha256.localeCompare(b.sha256)).slice(0,1));
 if(selected.length<3)throw Error('Для карусели нужны фото минимум трёх разных категорий; недостаточно проверенных оригиналов');
 const post:EditorialPost={version:1,id,kind:'carousel',carouselFormat:'photo-led',title:'Обо мне',topic:'Обо мне',
 goal:'Представить автора через личный архив. Категории фотографий — гипотеза модели; автор проверяет соответствие и право публикации.',
 slides:selected.map((a,i)=>({id:'slide-'+(i+1),text:texts[a.category],visual:'archive-photo',photoDirection:'Кандидат из локального фотоархива; проверить соответствие категории и право публикации.',photoRef:'about-me-archive/'+a.sha256})),
 caption:'Актёр. Композитор. Режиссёр. Три направления, в которых я рассказываю истории — через человека, музыку и сцену.',
 preset:'chocolate-graphite',fontPreset:'literata-golos',approvals:{topic:false,content:false,design:false},origin:'topic-choice',revision:1,createdAt:now,updatedAt:now};
 validatePost(post);return post;
}
const sha=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function importAboutMeDraft(id:string,onProgress:(message:string)=>void=()=>{}){
 const health=await fetch(personaWorkerUrl+'/health',{cache:'no-store',signal:AbortSignal.timeout(5000)});
 if(!health.ok)throw Error('Локальный Worker недоступен');
 const h=await health.json();if(h.service!=='persona-media-worker'||typeof h.token!=='string')throw Error('Worker не подтверждён');
 const headers={'X-Persona-Worker-Token':h.token};
 const response=await fetch(personaWorkerUrl+'/about-me/prepare',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error((await response.json().catch(()=>null))?.error??'Не удалось подготовить подборку');
 const pkg=validateAboutMePackage(await response.json()),available:string[]=[],errors:string[]=[];
 for(const category of categories){
  for(const a of pkg.assets.filter(x=>x.category===category).sort((a,b)=>b.score-a.score||a.sha256.localeCompare(b.sha256))){
   try{
    const existing=await readEditorialImageByRef('about-me-archive/'+a.sha256);
    if(existing){if(await sha(existing.blob)!==a.sha256)throw Error('Конфликт локального архива');}
    else{
     const r=await fetch(personaWorkerUrl+'/about-me/'+pkg.id+'/'+a.sha256,{headers,cache:'no-store',signal:AbortSignal.timeout(30000)});
     if(!r.ok)throw Error('Оригинал недоступен');
     const b=await r.blob();if(b.size>25*1024*1024||await sha(b)!==a.sha256)throw Error('Контрольная сумма не совпала');
     await saveEditorialImage('about-me-archive',a.sha256,new File([b],a.name,{type:b.type}));
    }
    available.push(a.sha256);break;
   }catch(e){errors.push(category+': '+(e instanceof Error?e.message:String(e)))}
  }
  onProgress('Импортировано направлений: '+available.length+' из 5');
 }
 const post=buildAboutMeDraft(id,pkg,available);
 return {post,scoresReused:pkg.scoresReused,missingCategories:categories.filter(k=>!pkg.assets.some(a=>a.category===k&&available.includes(a.sha256))),errors};
}
