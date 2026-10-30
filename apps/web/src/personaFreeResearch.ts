/**
 * Zero-credit Persona research. A bookmarked URL is NOT evidence of a watched
 * video, measured reach, audience retention, or a validated trend.
 * Browser-only storage; no API keys, scraping, AI credits, or uploads.
 */
export const PERSONA_FREE_RESEARCH_KEY='lifeos:persona:free-references:v1';

export type PersonaReferenceStatus='link-only'|'human-reviewed';
export type PersonaReferenceCategory='acting'|'comedy'|'music'|'visual'|'other';

export interface PersonaFreeReference {
 id:string;
 url:string;
 title:string;
 category:PersonaReferenceCategory;
 status:PersonaReferenceStatus;
 observation:string;
 createdAt:string;
}

export const FREE_TREND_SOURCES = [
 {name:'CapCut · трендовые шаблоны',url:'https://www.capcut.com/explore/trending-now',detail:'Смотри структуру и монтаж. Бесплатность отдельного шаблона проверяй в CapCut.'},
 {name:'TikTok Creative Center',url:'https://ads.tiktok.com/business/creativecenter/inspiration/popular/hashtag/pc/en',detail:'Актуальные темы и хештеги. Часть функций может требовать входа.'},
 {name:'Google Trends',url:'https://trends.google.com/trends/',detail:'Проверка интереса к теме; не является статистикой Reels.'},
 {name:'Яндекс Вордстат',url:'https://wordstat.yandex.ru/',detail:'Российский поисковый спрос; не число просмотров видео.'},
 {name:'YouTube · поиск Shorts',url:'https://www.youtube.com/results?search_query=%D0%B0%D0%BA%D1%82%D1%91%D1%80+shorts',detail:'Публичный поиск коротких актёрских видео; сравнивай даты и каналы.'}
] as const;

const allowedHosts=['instagram.com','tiktok.com','youtube.com','youtu.be','vk.com','vkvideo.ru','capcut.com','google.com','yandex.ru','rutube.ru','dzen.ru'];
const text=(v:unknown,max:number)=>typeof v==='string'?v.trim().slice(0,max):'';
export function normalizePersonaReferenceUrl(input:string):string{
 let url:URL;
 try{url=new URL(input.trim())}catch{throw new Error('Введи полную ссылку на публичное видео (https://…).')}
 if(url.protocol!=='https:'||url.username||url.password||url.port)
  throw new Error('Нужна обычная защищённая HTTPS-ссылка без логина, пароля или порта.');
 const hostname=url.hostname.toLowerCase();
 if(!allowedHosts.some(host=>hostname===host||hostname.endsWith('.'+host)))
  throw new Error('Поддерживаются Instagram, TikTok, YouTube, VK, CapCut, Rutube, Дзен и проверенные источники трендов.');
 if(url.pathname.length>1000)throw new Error('Слишком длинный адрес.');
 url.hash='';
 for(const name of [...url.searchParams.keys()]){
  if(/^(utm_|fbclid$|gclid$|igshid$|si$|feature$)/i.test(name))url.searchParams.delete(name);
 }
 return url.toString();
}
export function addPersonaFreeReference(current:readonly PersonaFreeReference[],draft:{
 url:string;title:string;category:PersonaReferenceCategory;observation?:string;
 status?:PersonaReferenceStatus;
},now:string,id:string):PersonaFreeReference[]{
 if(current.length>=100)throw new Error('В локальной библиотеке уже 100 референсов. Экспортируй данные перед добавлением новых.');
 const url=normalizePersonaReferenceUrl(draft.url);
 if(current.some(x=>x.url===url))throw new Error('Такая ссылка уже сохранена.');
 const title=text(draft.title,150),observation=text(draft.observation,1200);
 if(title.length<3)throw new Error('Укажи название ролика или референса.');
 if(!['acting','comedy','music','visual','other'].includes(draft.category))
  throw new Error('Недопустимая категория.');
 const status=draft.status??'link-only';
 if(status!=='link-only'&&status!=='human-reviewed')throw new Error('Неизвестный статус подтверждения.');
 if(status==='human-reviewed'&&observation.length<10)
  throw new Error('Для статуса «Просмотрено» запиши конкретное наблюдение (не менее 10 символов).');
 if(!Number.isFinite(Date.parse(now))||!id.trim())throw new Error('Не удалось создать локальную запись.');
 return [{id,url,title,category:draft.category,status,observation,createdAt:now},...current];
}
export function readPersonaFreeReferences(storage:Pick<Storage,'getItem'>):PersonaFreeReference[]{
 try{
  const data=JSON.parse(storage.getItem(PERSONA_FREE_RESEARCH_KEY)||'[]');
  if(!Array.isArray(data))return [];
  return data.slice(0,100).filter((x:unknown):x is PersonaFreeReference=>{
   if(!x||typeof x!=='object')return false;
   const v=x as Record<string,unknown>;
   try{return typeof v.id==='string'&&typeof v.url==='string'&&
    normalizePersonaReferenceUrl(v.url)===v.url&&typeof v.title==='string'&&
    typeof v.observation==='string'&&typeof v.createdAt==='string'&&
    ['link-only','human-reviewed'].includes(String(v.status))&&
    ['acting','comedy','music','visual','other'].includes(String(v.category))}
   catch{return false}
  });
 }catch{return []}
}
export function savePersonaFreeReferences(storage:Pick<Storage,'setItem'>,items:readonly PersonaFreeReference[]):void{
 storage.setItem(PERSONA_FREE_RESEARCH_KEY,JSON.stringify(items));
}
export function exportPersonaFreeReferences(items:readonly PersonaFreeReference[]):string{
 return JSON.stringify({version:1,kind:'persona-free-reference-export-v1',
  evidenceNotice:'Bookmarks and user observations only; not automatically watched videos or verified trend metrics.',
  references:items},null,2);
}
