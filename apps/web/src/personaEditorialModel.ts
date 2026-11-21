import approvedRecords from '../../../config/author-approved-carousels.json';
import baselineCaptions from '../../../config/carousel-baseline-pause-captions.json';
import quietHorror from '../../../config/carousel-quiet-horror.json';
import quietHorrorCaptions from '../../../config/carousel-quiet-horror-captions.json';
import {libraryBackground,validCinematicBackground,type CinematicBackground} from './personaEditorialBackgrounds';
import {hierarchyCopy,type EditorialHierarchy} from './personaEditorialTypography';
export const CAROUSEL_QUIET_HORROR_ID='carousel-quiet-horror';

/** Persona editorial pre-production: never equates a draft with an approved or published post.
 * This is a companion to existing PHOTO-001…010 ProductionJobs, not a second media job.
 * Local storage persists TEXT and editorial decisions. Image bytes live in IndexedDB.
 */
export const EDITORIAL_KEY='lifeos:persona:editorial-posts:v1';
export const STORY_KEY='lifeos:persona:weekly-stories:v1';
export const CAROUSEL_BASELINE_ID='carousel-baseline-pause';
export const CAROUSEL_002_ID='carousel-why-director-leaves-question';
export const CAROUSEL_003_ID='carousel-photo-archive';
export const CAROUSEL_004_ID='carousel-mixed-narrative';
const emptyChecklist=()=>[false,false,false,false,false,false,false];
const freshApproval=()=>({topic:false,content:false,design:false,
 checklist:emptyChecklist(),checkedAt:'',checkedBy:'',contentHashAtApproval:''});
const PALETTE_CONTRAST={
 ink:{bg:['#172132'],main:'#f3ead9',heading:'#cdb489'},
 cream:{bg:['#eee8dc'],main:'#242c33',heading:'#8a6b43'},
 chocolate:{bg:['#302720'],main:'#f7eade',heading:'#d3b18a'},
 filmic:{bg:['#292e30'],main:'#f3e9d6',heading:'#c5af8a'},
 'chocolate-graphite':{bg:['#2B1D14','#1C1C1E'],main:'#F2E9DC',heading:'#C9A882'}
} as const;
function luminance(hex:string):number{
 const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
  .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
export function editorialContrastRatio(a:string,b:string):number{
 const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
/** Palette only: image-backed slides need additional human visual review. */
export function editorialContrastPass(post:Pick<EditorialPost,'preset'>):boolean{
 const c=PALETTE_CONTRAST[post.preset];
 return c.bg.every(bg=>editorialContrastRatio(c.main,bg)>=4.5&&editorialContrastRatio(c.heading,bg)>=3);
}
/** Advisory only: deterministic editorial preflight, not fact checking or visual approval. */
export function carouselEditorialWarnings(post:Pick<EditorialPost,'kind'|'slides'|'caption'>):string[]{
 if(post.kind!=='carousel')return [];
 const warnings:string[]=[];
 const count=(s:string)=>s.trim()?s.trim().split(/\s+/u).length:0;
 if(!post.slides.length)return ['В карусели нет слайдов.'];
 if(count(post.slides[0].text)>12)
  warnings.push('Обложка перегружена: больше 12 слов. Проверь силу хука на телефоне.');
 post.slides.forEach((slide,i)=>{
  if(count(slide.text)>26)
   warnings.push('Слайд '+(i+1)+': больше 26 слов. Перенеси подробности в подпись.');
 });
 const normalized=post.slides.map(s=>s.text.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu,' ').trim());
 if(new Set(normalized.filter(Boolean)).size<normalized.filter(Boolean).length)
  warnings.push('Повторяется одинаковый текст на нескольких слайдах.');
 const last=post.slides[post.slides.length-1].text;
 if(/(?:сохраните|подпишитесь|ставьте лайк)/iu.test(last))
  warnings.push('Последний слайд заканчивается шаблонным призывом вместо нового смысла.');
 if(!post.caption.trim())warnings.push('Нет полноценного текста под публикацией.');
 return warnings;
}

export function editorialContentHash(post:Pick<EditorialPost,'title'|'topic'|'goal'|'caption'|'slides'|'preset'> & Partial<Pick<EditorialPost,'research'>>):string{
 const bytes=new TextEncoder().encode(JSON.stringify([post.title,post.topic,post.goal,
  post.caption,post.preset,post.slides.map(s=>{
   const values=s.photoRef?[s.id,s.text,s.visual,s.photoDirection,s.photoRef]:[s.id,s.text,s.visual,s.photoDirection];
   const design=s.background?[...values,s.background]:values;
   return s.headline!==undefined?[...design,s.kicker,s.headline,s.body,s.highlight??'','cormorant-inter-art-direction-v4']:design;
  }),...(post.research?[post.research]:[])]));
 let hash=0x811c9dc5;for(const b of bytes)hash=Math.imul(hash^b,0x01000193)>>>0;
 return 'fnv1a32:'+hash.toString(16).padStart(8,'0');
}
type ChatCarouselApproval={textApproved:boolean;textApprovedAt:string;designApproved:boolean;
 designApprovedAt:string|null;checkedBy:string;checklist:boolean[];checklistScope:'text';contentHashAtApproval:string};
const authorApprovedCarouselRecords:Record<string,ChatCarouselApproval>=Object.fromEntries(
 Object.entries(approvedRecords).map(([id,record])=>{
  if(record.checklistScope!=='text')throw Error('Invalid chat approval scope');
  return [id,{...record,checklistScope:'text' as const}];
 })
);

/** Use chat-approved data INSIDE the existing editorial approvals/gate, not as a parallel status.
 * A locally changed content fingerprint is never reapproved by this import.
 * The archived approval hash remains for the existing "Требует повторного утверждения" label.
 * Manual approvals for already-approved local projects always take precedence.
 */
/** Separate text hash: palette changes cannot undo written approval. */
export function editorialTextHash(post:Pick<EditorialPost,'title'|'topic'|'goal'|'caption'|'slides'> & Partial<Pick<EditorialPost,'research'>>):string{
 return editorialHash(JSON.stringify([post.title,post.topic,post.goal,post.caption,
  post.slides.map(s=>[s.id,s.text]),...(post.research?[post.research]:[])]));
}
function editorialHash(value:string):string{
 let hash=0x811c9dc5;
 for(const byte of new TextEncoder().encode(value))hash=Math.imul(hash^byte,0x01000193)>>>0;
 return 'fnv1a32:'+hash.toString(16).padStart(8,'0');
}
/** Content, palette and font-version fingerprint for artist visual approval. */
export function editorialDesignHash(post:EditorialPost):string{
 return editorialHash(JSON.stringify([editorialContentHash(post),
  post.id===CAROUSEL_BASELINE_ID&&post.fontPreset==='playfair-inter'?
   'persona-baseline-artist-layout-v3-no-page-numbers':
   post.id===CAROUSEL_QUIET_HORROR_ID&&post.fontPreset==='playfair-inter'?
    'persona-quiet-horror-v2-no-page-numbers':'persona-editorial-fonts-v1',
  post.fontPreset??'legacy']));
}
export const UNAPPROVED_DESIGN_MESSAGE='Оформление не утверждено. Посмотрите PNG и подтвердите';
export function publicationDesignApproved(post:EditorialPost):boolean{
 return post.approvals.design===true&&post.approvals.designApproved!==false&&
  (!post.approvals.contentHashAtDesignApproval||
   post.approvals.contentHashAtDesignApproval===editorialDesignHash(post));
}
/** Chat confirmation approves written content only; never implies rendered visual review. */
export function applyChatCarouselApproval(post:EditorialPost):EditorialPost{
 const record=authorApprovedCarouselRecords[post.id];
 if(!record||!record.textApproved||post.kind!=='carousel')return post;
 const valid=record.checklistScope==='text'&&record.checklist.length===7&&
  record.checklist.every(Boolean)&&record.designApproved===false&&
  record.designApprovedAt===null&&Number.isFinite(Date.parse(record.textApprovedAt))&&
  record.checkedBy==='Author (chat confirmation 2026-11-20)'&&
  /^fnv1a32:[a-f0-9]{8}$/.test(record.contentHashAtApproval);
 if(!valid)return post;
 if(post.approvals.design&&post.approvals.designApproved===true&&
    post.approvals.contentHashAtDesignApproval===editorialDesignHash(post))return post;
 // Preserve verified manual approvals that were not imported from chat.
 if(post.approvals.design&&post.approvals.checkedBy==='Автор'&&
  post.approvals.contentHashAtApproval===editorialContentHash(post))return post;
 if(record.contentHashAtApproval!==editorialContentHash(post)){
  // A changed palette preserves text approval only with a separate matching text hash.
  if(post.approvals.textApproved&&post.approvals.content&&
   post.approvals.textHashAtApproval===editorialTextHash(post)){
   return {...post,approvals:{...post.approvals,design:false,designApproved:false,
    designApprovedAt:null,contentHashAtDesignApproval:''}};
  }
  if(post.approvals.contentHashAtApproval)return post;
  return {...post,approvals:{...post.approvals,topic:false,content:false,design:false,
   textApproved:false,designApproved:false,designApprovedAt:null,checklist:emptyChecklist(),
   checkedAt:record.textApprovedAt,checkedBy:record.checkedBy,
   contentHashAtApproval:record.contentHashAtApproval}};
 }
 const hydrated={...post,approvals:{...post.approvals,topic:true,content:true,design:false,
  textApproved:true,textHashAtApproval:editorialTextHash(post),
  designApproved:false,designApprovedAt:null,contentHashAtDesignApproval:'',
  checklist:[...record.checklist],checkedAt:record.textApprovedAt,
  checkedBy:record.checkedBy,contentHashAtApproval:record.contentHashAtApproval}};
 validatePost(hydrated);return hydrated;
}

export function editorialArchiveProvenancePass(post:EditorialPost,availableKeys:readonly string[]):boolean{
 return post.slides.every(s=>s.visual!=='archive-photo'||Boolean(s.photoRef&&availableKeys.includes(s.photoRef)));
}
export function editorialChecklistState(post:EditorialPost):boolean[]{
 const a=post.approvals.checklist??emptyChecklist(),manual=a.slice(0,6);
 // The new archive-aware fixtures derive item 6; existing fixtures retain
 // the original manual checklist behavior. IndexedDB existence is checked
 // separately before approving or exporting.
 if(post.carouselFormat)manual[5]=editorialArchiveProvenancePass(post,
  post.slides.flatMap(s=>s.photoRef&&/^[-A-Za-z0-9]{3,75}\/[-A-Za-z0-9]{3,75}$/.test(s.photoRef)?[s.photoRef]:[]));
 return [...manual,editorialContrastPass(post)];
}
export function editorialChecklistReady(post:EditorialPost):boolean{
 return post.kind==='carousel'&&editorialChecklistState(post).every(Boolean);
}
export function setEditorialChecklistItem(post:EditorialPost,index:number,checked:boolean,now=new Date().toISOString()):EditorialPost{
 if(post.kind!=='carousel'||editorialStage(post)!=='design')throw Error('Чек-лист доступен до утверждения оформления');
 if(!Number.isInteger(index)||index<0||index>5||typeof checked!=='boolean'||(post.carouselFormat&&index===5))throw Error('Пункт 6/7 проверяется автоматически для архивных каруселей');
 const checklist=editorialChecklistState(post);checklist[index]=checked;
 const result={...post,revision:post.revision+1,updatedAt:now,approvals:{...post.approvals,checklist}};
 validatePost(result);return result;
}

export type PostKind='carousel'|'photo';
export type SlideVisual='background'|'archive-photo';
export type EditorialPreset='ink'|'cream'|'chocolate'|'filmic'|'chocolate-graphite';
export type EditorialSlide={id:string;text:string;visual:SlideVisual;photoDirection:string;photoRef?:string;background?:CinematicBackground}&Partial<EditorialHierarchy>;
/** Imported research is evidence supplied by a person, not automatic fact verification. */
export type EditorialResearch={
 provider:'manual';
 sourceItems:{slideId:string;title:string;url:string;reviewed:boolean}[];
 interpretationSlides:string[];
 /** Manual review of public title and caption, not machine fact-checking. */
 copyReviewed?:boolean;
};
export type EditorialPost={version:1;id:string;kind:PostKind;title:string;topic:string;
 goal:string;slides:EditorialSlide[];caption:string;preset:EditorialPreset;
  fontPreset?:'legacy'|'playfair-inter';carouselFormat?:'photo-led'|'mixed';
 approvals:{topic:boolean;content:boolean;design:boolean;
 checklist?:boolean[];checkedAt?:string;checkedBy?:string;contentHashAtApproval?:string;
  textApproved?:boolean;textHashAtApproval?:string;designApproved?:boolean;
  designApprovedAt?:string|null;contentHashAtDesignApproval?:string};
 createdAt:string;updatedAt:string;revision:number;
 origin:'seed-carousel'|'topic-choice'|'researched-topic';scheduledDate?:string;researchSourceDoc?:string;research?:EditorialResearch};
/** Existing legacy projects keep saved approvals. Every NEW researched project
 * starts with a source contract that is unverified until reviewed by the author. */
export function editorialSourcesPass(post:EditorialPost):boolean{
 if(!post.research)return true;
 if(post.research.copyReviewed!==true)return false;
 return post.slides.every(slide=>{
  const sources=post.research!.sourceItems.filter(item=>item.slideId===slide.id);
  const interpretation=post.research!.interpretationSlides.includes(slide.id);
  return interpretation?sources.length===0:sources.length>0&&sources.every(item=>item.reviewed);
 });
}
/** Explicit human review of a citation; no network request or inferred verification. */
export function setEditorialSourceReviewed(
 post:EditorialPost,slideId:string,url:string,reviewed:boolean,
 now=new Date().toISOString()
):EditorialPost{
 if(!post.research)throw Error('У проекта нет исследовательского пакета');
 if(!post.research.sourceItems.some(x=>x.slideId===slideId&&x.url===url))
  throw Error('Источник не найден в проекте');
 const research:EditorialResearch={...post.research,sourceItems:post.research.sourceItems.map(x=>
  x.slideId===slideId&&x.url===url?{...x,reviewed}:x)};
 const approvals={...post.approvals,content:false,design:false,designApproved:false,
  designApprovedAt:null,contentHashAtDesignApproval:'',textApproved:false,textHashAtApproval:'',
  checklist:emptyChecklist()};
 const result:EditorialPost={...post,research,approvals,revision:post.revision+1,updatedAt:now};
 validatePost(result);return result;
}
/** Changing evidence revokes all dependent content and visual approvals. */
function changeEditorialEvidence(post:EditorialPost,research:EditorialResearch,now:string):EditorialPost{
 const approvals={...post.approvals,content:false,design:false,designApproved:false,
  designApprovedAt:null,contentHashAtDesignApproval:'',textApproved:false,textHashAtApproval:'',
  contentHashAtApproval:'',checkedAt:'',checkedBy:'',checklist:emptyChecklist()};
 const result:EditorialPost={...post,research,approvals,revision:post.revision+1,updatedAt:now};
 validatePost(result);return result;
}
export function editorialValidEvidenceUrl(raw:string):boolean{
 try{
  const u=new URL(raw),h=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(!['https:','http:'].includes(u.protocol)||!h||u.username||u.password||
     raw.length>2048||u.hash.length>512)return false;
  if(h==='localhost'||h.endsWith('.localhost')||h==='0.0.0.0'||h==='::1'||
    h.endsWith('.local')||h.startsWith('169.254.')||h.startsWith('192.168.')||
    h.startsWith('127.')||h.startsWith('10.')||h.startsWith('0.')||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h)||h.startsWith('fe80:')||
    h.startsWith('fc')||h.startsWith('fd'))return false;
  return true;
 }catch{return false}
}
/** Sources are initially unverified; a URL by itself never proves the fact. */
export function addEditorialSource(
 post:EditorialPost,slideId:string,title:string,url:string,now=new Date().toISOString()
):EditorialPost{
 if(!post.research||!post.slides.some(s=>s.id===slideId))throw Error('Не найден исследовательский слайд');
 if(!title.trim()||title.length>160||!editorialValidEvidenceUrl(url))throw Error('Источник: неверное название или URL');
 if(post.research.interpretationSlides.includes(slideId))
  throw Error('Сначала сними пометку об авторской интерпретации');
 if(post.research.sourceItems.filter(x=>x.slideId===slideId).length>=4)
  throw Error('Не более четырёх источников на слайд');
 if(post.research.sourceItems.some(x=>x.slideId===slideId&&x.url===url))
  throw Error('Этот источник уже добавлен');
 const research:EditorialResearch={...post.research,sourceItems:[...post.research.sourceItems,
  {slideId,title:title.trim(),url,reviewed:false}]};
 return changeEditorialEvidence(post,research,now);
}
export function removeEditorialSource(
 post:EditorialPost,slideId:string,url:string,now=new Date().toISOString()
):EditorialPost{
 if(!post.research||!post.research.sourceItems.some(x=>x.slideId===slideId&&x.url===url))
  throw Error('Источник не найден');
 return changeEditorialEvidence(post,{...post.research,
  sourceItems:post.research.sourceItems.filter(x=>x.slideId!==slideId||x.url!==url)},now);
}
export function setEditorialInterpretationReviewed(
 post:EditorialPost,slideId:string,reviewed:boolean,now=new Date().toISOString()
):EditorialPost{
 if(!post.research||!post.slides.some(s=>s.id===slideId))throw Error('Не найден исследовательский слайд');
 if(reviewed&&post.research.sourceItems.some(x=>x.slideId===slideId))
  throw Error('У слайда есть источники; нельзя маскировать факт авторской трактовкой');
 const interpretationSlides=reviewed?[...new Set([...post.research.interpretationSlides,slideId])]:
  post.research.interpretationSlides.filter(id=>id!==slideId);
 return changeEditorialEvidence(post,{...post.research,interpretationSlides},now);
}
export function setEditorialPublicCopyReviewed(
 post:EditorialPost,reviewed:boolean,now=new Date().toISOString()
):EditorialPost{
 if(!post.research)throw Error('У проекта нет исследовательского пакета');
 return changeEditorialEvidence(post,{...post.research,copyReviewed:reviewed},now);
}
export type StoryNote={id:string;date:string;text:string;state:'idea'|'captured'|'published';createdAt:string};
export type EditorialStore={version:1;posts:EditorialPost[]};
export type TopicChoice={id:string;kind:PostKind;title:string;angle:string;
 slides:string[];caption:string;photoDirection:string};

const seedRows:[string,string,string[],string][]=[
 ['Четыре секунды до выбора','Актёрское превращение в одном ракурсе',
 ['Он ещё верит','Теперь он сомневается','Улыбка ничего не объясняет','Решение уже принято'],
 'Иногда история меняется раньше, чем герой произнесёт хоть слово. Один ракурс, четыре состояния — и четыре совершенно разных обстоятельства. Какой взгляд кажется тебе самым убедительным?'],
 ['Пока нота не стала сценой','Музыкальное решение до первого исполнителя',
 ['Здесь пока тихо','Но ритм уже есть','Пальцы ищут форму','Пауза обрела голос'],
 'Пока музыка ещё существует только в набросках, она уже может задавать действие. Ритм, пауза, незаконченная мысль — всё это начинает работать задолго до готовой партитуры.'],
 ['Один стул, три человека','Характер рождается из действия, а не костюма',
 ['Предмет всегда один','Один ждёт ответа','Другой прячет вину','Третий больше не ждёт'],
 'Один и тот же стул. Но персонаж меняется — вместе с задачей, взглядом и отношением к пространству. Сценография минимальна, обстоятельства — нет.'],
 ['Кадр умеет скрывать','Режиссёрское решение через границы кадра',
 ['Сначала важна дистанция','Потом один жест','За границей кадра — выбор','Зритель сам делает шаг'],
 'Камера показывает не всё. И именно поэтому зритель начинает достраивать историю сам. Иногда один жест точнее общего плана.'],
 ['Одна секунда на экране','Цена точности одного кадра',
 ['В кадре — одна секунда','За кадром — работа','Свет проверяет детали','Остаётся только взгляд'],
 'Мы видим только результат. За одним коротким кадром могут стоять выбор ракурса, поиск света и много невидимых решений. Смысл в том, чтобы всё это исчезло из поля зрения зрителя.'],
 ['Музыка спорит с текстом','Контрапункт слова и мелодии',
 ['Мелодии недостаточно','Ей нужен конфликт','Герою — причина молчать','Нота становится поступком'],
 'Если музыка только повторяет эмоцию текста, сцена может потерять второй план. Интереснее, когда мелодия вступает с героем в спор — и даёт услышать то, о чём он молчит.'],
 ['История без диалога','Визуальное повествование предметами',
 ['Ключ лежит неслучайно','Дверь всё ещё закрыта','В прихожей горит свет','Кого здесь ждут?'],
 'Ключ, дверь, пустая прихожая. Ни одной реплики — а у зрителя уже появляются вопросы. Какой предмет ты бы добавил в эту историю?'],
 ['Свет меняет характер','Один портрет и несколько характеров',
 ['Один человек','Свет меняет вопрос','Тень скрывает ответ','Но взгляд всё тот же'],
 'Свет не меняет человека, но меняет наше предположение о нём. Порой достаточно сдвинуть источник, чтобы знакомое лицо стало незнакомым.'],
 ['Мюзикл без занавеса','Драматургия авторской музыки',
 ['Сначала — чужое решение','Потом — новая мелодия','Два голоса врозь','Сцена требует ответа'],
 'Мюзикл начинается не с занавеса: сначала возникают обстоятельства, решение героя и музыка, которая не даёт отступить. Даже пока сцена существует только на бумаге.'],
 ['Не резюме. Четыре кадра.','Три творческие дисциплины — одна авторская история',
 ['В кадре — актёр','За клавишами — композитор','За кадром — режиссёр','В центре — одна история'],
 'Актёрство, музыка и режиссура смотрят на одну сцену с разных сторон. Главное — не перечислять профессии, а находить историю, в которой они действительно встречаются.']
];
const photoTopics:[string,string,string,string][]=[
 ['Портрет до реплики','Актёрская пауза в портрете','Крупный портрет в естественном оконном свете.',
 'Есть моменты, когда выражение лица говорит точнее любой реплики. Для такого кадра важнее обстоятельство, чем поза.'],
 ['Партитура рядом','Композитор между заметкой и музыкой','Автор за фортепиано; нотный лист или руки на клавишах.',
 'Иногда самый интересный кадр — не концертный, а рабочий. Набросок, клавиши и пауза перед следующим музыкальным решением.'],
 ['После репетиции','Пространство, в котором только что была сцена','Пустая сцена или предмет после настоящей репетиции.',
 'Пустое пространство тоже умеет хранить напряжение. Особенно когда действие уже закончилось, а вопрос остался.'],
 ['Режиссёрский взгляд','Неочевидный ракурс обычного пространства','Портрет рядом с режиссёрскими заметками или раскадровкой.',
 'Кадр начинается с вопроса: что зритель должен увидеть и чего не должен заметить? Иногда ответ — в расстоянии до героя.'],
 ['Деталь персонажа','Характер в одной вещи','Предмет, костюмная деталь или руки в выразительном крупном плане.',
 'Вещь на сцене становится важной, только когда за ней возникает действие. Даже самая простая деталь может изменить ожидание.'],
 ['Звук пустого зала','Театральная атмосфера без постановочного пафоса','Зал или кулисы; используй только доступный реальный кадр.',
 'Когда зал пустой, особенно ясно, сколько места остаётся для воображения.'],
 ['Рабочая тетрадь','Процесс вместо финальной демонстрации','Собственные заметки, режиссёрский план или нотный черновик.',
 'Работа не всегда выглядит эффектно. Иногда движение вперёд — это одна правка, один вопрос и перечёркнутая строка.'],
 ['Пианино и тишина','Музыкальная атмосфера без фоновой суеты','Портрет у инструмента с мягким боковым светом.',
 'Пауза — не отсутствие музыки. Она часто задаёт смысл тому, что прозвучит следующим.'],
 ['До выхода на сцену','Момент ожидания действия','Силуэт в кулисах или документальная деталь подготовки.',
 'Перед действием есть особая тишина: ещё ничего не произошло, но обстоятельства уже меняются.'],
 ['Авторский кадр','Образ человека за профессиями','Честный портрет без тяжёлой ретуши в натуральном свете.',
 'Иногда хочется оставить только один кадр. Без перечисления регалий и без попытки что-то доказать.']
];
const extraCarousel:[string,string,string[],string][]=[
 ['Когда пауза работает сильнее слов','Драматургия молчания',
 ['Сначала хочется объяснить','Но герой молчит','Зритель слышит больше','Смысл возникает в паузе'],
 'Не всякое молчание — пустота. Иногда оно становится самым точным действием героя.'],
 ['Почему красивого кадра недостаточно','Свет и смысл в постановке',
 ['Красоты недостаточно','Нужен вопрос','Нужна причина смотреть','И только потом — свет'],
 'Выразительная картинка цепляет взгляд. Но удерживает зрителя то, что происходит внутри кадра.'],
 ['Один предмет как драматургия','Предмет вместо декорации',
 ['Один предмет','Разные обстоятельства','Новая задача героя','Другой смысл вещи'],
 'Предмет в кадре работает тогда, когда у героя появляется к нему отношение.'],
 ['Музыка не иллюстрирует героя','Композиция как конфликт',
 ['Текст говорит одно','Музыка возражает','Появляется второй план','Сцена становится объёмнее'],
 'Музыка может спорить с героем, а не только подчеркивать его чувства.']
];
export const SEED_CAROUSELS=seedRows.map(([title,goal,slides,caption],index)=>({
 id:'PHOTO-'+String(index+1).padStart(3,'0'),title,goal,slides,caption
}));
export const TOPIC_CHOICES:TopicChoice[]=[
 ...photoTopics.map(([title,angle,direction,caption],i)=>({
  id:'photo-topic-'+String(i+1),kind:'photo' as const,title,angle,
  slides:[title],photoDirection:direction,caption
 })),
 ...extraCarousel.map(([title,angle,slides,caption],i)=>({
  id:'carousel-topic-'+String(i+1),kind:'carousel' as const,title,angle,slides,
  photoDirection:'По выбору автора: фон либо фотография из архива',caption
 }))
];
export function proposeTopics(kind:PostKind,usedTitles:string[]=[]):TopicChoice[]{
 const blocked=new Set(usedTitles.map(s=>s.toLocaleLowerCase('ru-RU')));
 return TOPIC_CHOICES.filter(s=>s.kind===kind&&!blocked.has(s.title.toLocaleLowerCase('ru-RU')));
}
export function createSeedEditorialCarousel(id:string,now=new Date().toISOString()):EditorialPost{
 const seed=SEED_CAROUSELS.find(s=>s.id===id);
 if(!seed)throw Error('Unknown existing carousel '+id);
 return {
  version:1,id,kind:'carousel',title:seed.title,topic:seed.title,goal:seed.goal,
  slides:seed.slides.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background' as const,photoDirection:''})),
  caption:seed.caption,preset:'ink',approvals:freshApproval(),
  createdAt:now,updatedAt:now,revision:1,origin:'seed-carousel'
 };
}
export function createEditorialFromTopic(id:string,choice:TopicChoice,now=new Date().toISOString()):EditorialPost{
 if(!id||!/^[a-zA-Z0-9-]{3,75}$/.test(id)||!TOPIC_CHOICES.some(x=>x.id===choice.id))
  throw Error('Unknown topic selection');
 return {version:1,id,kind:choice.kind,title:choice.title,topic:choice.title,goal:choice.angle,
  slides:choice.slides.map((text,i)=>({id:'slide-'+(i+1),text,visual:choice.kind==='photo'?'archive-photo':'background',
   photoDirection:choice.photoDirection})),
  caption:choice.caption,preset:'ink',approvals:freshApproval(),
  origin:'topic-choice',createdAt:now,updatedAt:now,revision:1};
}
/** Research-derived concepts enter the SAME approval workflow as legacy
 * carousels. Model text is an unverified draft, never author-approved. */
export function createResearchedEditorialPost(
 id:string,title:string,angle:string,
 draft?:{caption:string;slides:{title:string;body:string}[]},
 now=new Date().toISOString()
):EditorialPost{
 if(!/^[A-Za-z0-9-]{3,75}$/.test(id)||!title.trim()||title.length>160||
  !angle.trim()||angle.length>500)throw Error('Нужна конкретная тема и задача');
 const steps=draft?.slides.length&&draft.slides.length>=3&&draft.slides.length<=8
  ?draft.slides.map(s=>s.title.trim().slice(0,170))
  :['Зацепка и вопрос зрителю','Конфликт или контраст','Новая деталь','Поворот в смысле','Незавершённый вывод'];
 const result:EditorialPost={version:1,id,kind:'carousel',title:title.trim(),topic:title.trim(),
  goal:angle.trim(),slides:steps.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background',photoDirection:''})),
  caption:draft?.caption?.slice(0,4500)??'',preset:'ink',
  research:{provider:'manual',sourceItems:[],interpretationSlides:[],copyReviewed:false},
  approvals:freshApproval(),origin:'researched-topic',
  revision:1,createdAt:now,updatedAt:now};
 validatePost(result);return result;
}
export function createQuietHorrorCarousel(now=new Date().toISOString()):EditorialPost{
 const post:EditorialPost={version:1,id:CAROUSEL_QUIET_HORROR_ID,kind:'carousel',
  title:quietHorror.title,topic:quietHorror.title,goal:'Факт + мнение · text-only',
  slides:quietHorror.slides.map((copy,i)=>({...copy,id:'slide-'+(i+1),text:hierarchyCopy(copy),visual:'background',photoDirection:'',background:libraryBackground(i)})),
  caption:quietHorrorCaptions.variants[quietHorrorCaptions.active as '1'|'2'],
  preset:'chocolate-graphite',fontPreset:'playfair-inter',approvals:{...freshApproval(),textApproved:false,designApproved:false},
  origin:'researched-topic',revision:1,createdAt:now,updatedAt:now};
 validatePost(post);return post;
}
/** Opt-in Editorial Desk seed. Never overwrites PHOTO-001…010. */
export function createBaselinePauseCarousel(now=new Date().toISOString()):EditorialPost{
 const texts=[
  'Пауза — это не отсутствие текста.',
  'Персонаж уже знает ответ.',
  'Но сказать правду — значит что-то потерять.',
  'Поэтому он задерживает слово.',
  'Зритель замечает этот выбор.',
  'Так молчание становится действием.'
 ];
 const post:EditorialPost={version:1,id:CAROUSEL_BASELINE_ID,kind:'carousel',
  title:'Почему пауза сильнее реплики',topic:'Почему пауза сильнее реплики',
  goal:'Авторская мысль · text-only, без фотографий',
  slides:texts.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background',photoDirection:''})),
  caption:baselineCaptions.active==='short'||baselineCaptions.active==='medium'||baselineCaptions.active==='long'?baselineCaptions.variants[baselineCaptions.active]:baselineCaptions.variants.medium,preset:'chocolate-graphite',fontPreset:'playfair-inter',approvals:freshApproval(),origin:'researched-topic',
  revision:1,createdAt:now,updatedAt:now};
 validatePost(post);return post;
}
/** Opt-in research-backed fixture; same Editorial Desk, statuses and color preset. */
export function createDirectorQuestionCarousel(now=new Date().toISOString()):EditorialPost{
 const texts=[
  'Открытый финал — не отсутствие ответа, а другой его адрес.',
  'Зритель достраивает смысл, которого режиссёр не сказал.',
  'Но пустота работает, только если она изнутри логична.',
  'Хороший финал отвечает почти на всё — оставляет один вопрос.',
  'Вопрос держит зрителя после экрана. Это и есть работа.',
  'Режиссёр оставляет вопрос, когда ответ был бы ложью.'
 ];
 const caption=[
  'Открытый финал — не то же самое, что отсутствие финала. Зритель прощает недосказанность, если чувствует, что режиссёр знал ответ и сознательно его не произнёс. И не прощает, когда чувствует, что ответа не было. Разница не в количестве информации, а в её наличии за кадром.',
  'Брук называет пустое пространство приглашением к воображению. Нолан уточняет: неоднозначность должна вырастать из неспособности персонажа знать, а не из небрежности автора. Макки разделяет открытый финал и размытость: открытый финал оставляет один вопрос, размытость — снимает правила мира. Мамет напоминает, что задача драматурга — держать зрителя в вопросе "что будет дальше", а не объяснять, что было.',
  'Практический вывод простой: оставляйте открытым вопрос, но не мотивацию, не ставки и не логику мира. Тогда молчание финала продолжает работать после экрана — это и есть его задача.'
 ].join('\n\n');
 const post:EditorialPost={version:1,id:CAROUSEL_002_ID,kind:'carousel',
  title:'Зачем режиссёру оставлять зрителя без ответа',
  topic:'Зачем режиссёру оставлять зрителя без ответа',
  goal:'Авторская мысль · text-only, 6 слайдов · исследование в docs',
  slides:texts.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background',photoDirection:''})),
  caption,preset:'chocolate-graphite',approvals:freshApproval(),
  origin:'researched-topic',researchSourceDoc:'docs/carousel-002-research-sources.md',
  revision:1,createdAt:now,updatedAt:now};
 validatePost(post);return post;
}

/** Carousel 003: original archive photos, text-only until the author picks assets. */
export function createPhotoArchiveCarousel(now=new Date().toISOString()):EditorialPost{
 const texts=[
  'Стул — не мебель. Это обстоятельство.',
  'Первый персонаж садится, потому что устал.',
  'Второй — потому что должен ждать.',
  'Третий не садится вовсе.',
  'Одна и та же точка в кадре, три разных решения.',
  'Тело актёра читается раньше слов.'
 ];
 const post:EditorialPost={version:1,id:CAROUSEL_003_ID,kind:'carousel',carouselFormat:'photo-led',
  title:'Один стул — три совершенно разных персонажа',
  topic:'Один стул — три совершенно разных персонажа',
  goal:'Актёрская задача и мизансцена: архивные фото; без них — text-only fallback.',
  slides:texts.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background',
   photoDirection:'Авторское фото для слайда '+(i+1)+': один стул, разные обстоятельства.'})),
  caption:'Один стул может означать отдых, ожидание или отказ. Меняется не декорация, а обстоятельство и задача актёра. Важно не сыграть «усталость» или «ожидание» в общем виде, а понять, зачем человек занимает это место и чего хочет от другого. Тогда одна и та же мизансцена обнаруживает разные характеры — ещё до первой реплики.',
  preset:'chocolate-graphite',approvals:freshApproval(),origin:'researched-topic',
  revision:1,createdAt:now,updatedAt:now};
 validatePost(post);return post;
}
/** Carousel 004: photo/text alternation with safe text fallback. */
export function createMixedNarrativeCarousel(now=new Date().toISOString()):EditorialPost{
 const texts=[
  'До первой реплики герой уже что-то решил.',
  'Зритель ещё не знает что.',
  'Тело уже выдаёт решение — плечи, взгляд, дыхание.',
  'Слово только подтверждает то, что уже произошло.',
  'Поэтому первая реплика — не начало, а следствие.',
  'Сцена начинается раньше, чем произносится первое слово.'
 ];
 const post:EditorialPost={version:1,id:CAROUSEL_004_ID,kind:'carousel',carouselFormat:'mixed',
  title:'Что происходит с героем до первой реплики',
  topic:'Что происходит с героем до первой реплики',
  goal:'Фото → текст → фото → текст → фото → текст; без фото — text-only fallback.',
  slides:texts.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background',
   photoDirection:i%2===0?'Фото: невербальное решение персонажа':'Текстовый слайд'})),
  caption:'Сценическое действие начинается до первого произнесённого слова. Актёр может уже принять решение, скрыть страх, выбрать дистанцию или отказаться от контакта. Зритель считывает направление взгляда, дыхание, положение плеч. Поэтому первая реплика работает как последствие внутреннего действия — и её смысл зависит от того, что происходило с телом до неё.',
  preset:'chocolate-graphite',approvals:freshApproval(),origin:'researched-topic',
  revision:1,createdAt:now,updatedAt:now};
 validatePost(post);return post;
}

export function editorialStage(post:EditorialPost):'topic'|'content'|'design'|'production'{
 if(!post.approvals.topic)return 'topic';
 if(!post.approvals.content)return 'content';
 if(!post.approvals.design)return 'design';
 return 'production';
}
export function editorialStageLabel(post:EditorialPost):string{
 if(post.kind==='carousel'&&!post.approvals.design&&post.approvals.contentHashAtApproval)
  return 'Требует повторного утверждения';
 switch(editorialStage(post)){
  case 'topic':return 'Тема на утверждении';
  case 'content':return 'Текст на утверждении';
  case 'design':return 'Оформление на утверждении';
  case 'production':return 'Готов к производству';
 }
}
export function validatePost(post:EditorialPost):void{
 if(post.version!==1||!/^[A-Za-z0-9-]{3,75}$/.test(post.id)||
  !['photo','carousel'].includes(post.kind)||!post.topic.trim()||post.topic.length>160||
  (post.approvals.topic&&(!post.title.trim()||!post.topic.trim()||!post.goal.trim()))||post.title.length>160||post.goal.length>500||
  typeof post.caption!=='string'||post.caption.length>4500||
  (post.researchSourceDoc!==undefined&&
   (typeof post.researchSourceDoc!=='string'||post.researchSourceDoc.length>160||
    !/^docs\/[a-z0-9][a-z0-9-]*\.md$/.test(post.researchSourceDoc)))||
  (post.scheduledDate!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(post.scheduledDate)||
   !Number.isFinite(Date.parse(post.scheduledDate+'T12:00:00Z'))||
   new Date(post.scheduledDate+'T12:00:00Z').toISOString().slice(0,10)!==post.scheduledDate))||
  (post.carouselFormat!==undefined&&!['photo-led','mixed'].includes(post.carouselFormat))||
  (post.fontPreset!==undefined&&!['legacy','playfair-inter'].includes(post.fontPreset))||
  !['ink','cream','chocolate','filmic','chocolate-graphite'].includes(post.preset)||
  !post.approvals||['topic','content','design'].some(k=>typeof post.approvals[k as keyof typeof post.approvals]!=='boolean')||
  !Number.isInteger(post.revision)||post.revision<1||!Number.isFinite(Date.parse(post.updatedAt))||
  !Array.isArray(post.slides)||post.slides.length!==(post.kind==='photo'?1:post.slides.length)||
  post.slides.length<(post.kind==='carousel'?3:1)||post.slides.length>(post.kind==='carousel'?8:1)||
  new Set(post.slides.map(s=>s.id)).size!==post.slides.length||
  post.slides.some(s=>!s.id||typeof s.text!=='string'||s.text.length>(s.headline!==undefined?600:post.research?260:170)||
   (s.headline!==undefined&&(typeof s.kicker!=='string'||s.kicker.length>60||typeof s.headline!=='string'||!s.headline.trim()||s.headline.length>170||typeof s.body!=='string'||s.body.length>350||
    (s.highlight!==undefined&&(typeof s.highlight!=='string'||s.highlight.length>170))||s.text!==hierarchyCopy(s as EditorialHierarchy)))||
   (s.background!==undefined&&!validCinematicBackground(s.background))||
   (post.approvals.content&&s.visual==='background'&&!s.text.trim())||
   !['background','archive-photo'].includes(s.visual)||typeof s.photoDirection!=='string'||s.photoDirection.length>350||
    (s.photoRef!==undefined&&(typeof s.photoRef!=='string'||!/^[-A-Za-z0-9]{3,75}\/[-A-Za-z0-9]{3,75}$/.test(s.photoRef)))))
  throw Error('Invalid editorial project');
 if(post.research){
  const r=post.research,ids=new Set(post.slides.map(s=>s.id));
  if(r.provider!=='manual'||(r.copyReviewed!==undefined&&typeof r.copyReviewed!=='boolean')||
    !Array.isArray(r.sourceItems)||r.sourceItems.length>32||
   !Array.isArray(r.interpretationSlides)||
   r.interpretationSlides.some(id=>!ids.has(id))||
   new Set(r.interpretationSlides).size!==r.interpretationSlides.length||
   r.sourceItems.some(x=>!ids.has(x.slideId)||!x.title||x.title.length>160||
    typeof x.reviewed!=='boolean'||!editorialValidEvidenceUrl(x.url)||
    r.interpretationSlides.includes(x.slideId))||
   new Set(r.sourceItems.map(x=>x.slideId+'|'+x.url)).size!==r.sourceItems.length)
   throw Error('Invalid editorial research evidence');
 }
 const a=post.approvals;
 if(a.checklist!==undefined&&(!Array.isArray(a.checklist)||a.checklist.length!==7||
  a.checklist.some(x=>typeof x!=='boolean')))throw Error('Invalid carousel checklist');
 if([a.checkedAt,a.checkedBy,a.contentHashAtApproval,a.textHashAtApproval,
  a.contentHashAtDesignApproval].some(x=>x!==undefined&&typeof x!=='string'))
  throw Error('Invalid checklist audit');
 if(a.checkedAt&&(!Number.isFinite(Date.parse(a.checkedAt))||!a.checkedBy||!a.contentHashAtApproval))
  throw Error('Incomplete checklist audit');
 // Previously approved legacy v1 projects without checklist metadata are preserved.
 if(post.kind==='carousel'&&a.design&&a.checklist){
  if(!a.checklist.every(Boolean)||!editorialContrastPass(post)||
   a.contentHashAtApproval!==editorialContentHash(post)||!a.checkedAt||!a.checkedBy)
   throw Error('Carousel acceptance approval is missing or stale');
 }
 if(a.designApproved===true&&(!a.design||!a.designApprovedAt||
   a.contentHashAtDesignApproval!==editorialDesignHash(post)))
  throw Error('Visual approval missing or stale');
 if(post.approvals.content&&!post.approvals.topic)throw Error('Content approved before topic');
 if(post.approvals.design&&!post.approvals.content)throw Error('Design approved before content');
 if(post.approvals.content&&!post.caption.trim())throw Error('Caption required for approval');
}
export function reviseEditorialPost(post:EditorialPost,changes:Partial<Pick<EditorialPost,'topic'|'title'|'goal'|'caption'|'preset'|'fontPreset'|'slides'|'scheduledDate'>>,now=new Date().toISOString()):EditorialPost{
 if(changes.slides)changes={...changes,slides:changes.slides.map(s=>{
  if(s.headline===undefined)return s;
  const previous=post.slides.find(p=>p.id===s.id);
  const copyChanged=!previous||(['kicker','headline','body','highlight'] as const).some(k=>s[k]!==previous[k]);
  return copyChanged?{...s,text:hierarchyCopy(s as EditorialHierarchy)}:s;
 })};
 const result:EditorialPost={...post,...changes,updatedAt:now,revision:post.revision+1,approvals:{...post.approvals}};
 if(changes.topic!==undefined||changes.title!==undefined||changes.goal!==undefined)
  result.approvals={...result.approvals,topic:false,content:false,design:false};
 else if(changes.caption!==undefined)
  result.approvals={...result.approvals,content:false,design:false};
 else if(changes.slides!==undefined){
  const copyChanged=changes.slides.length!==post.slides.length||
   changes.slides.some((slide,i)=>slide.id!==post.slides[i]?.id||slide.text!==post.slides[i]?.text);
  result.approvals=copyChanged?{...result.approvals,content:false,design:false}:
   {...result.approvals,design:false};
 }else if(changes.preset!==undefined||changes.fontPreset!==undefined)
  result.approvals={...result.approvals,design:false};
 // Changed wording invalidates human verification for affected factual claims.
 if(result.research&&(changes.topic!==undefined||changes.title!==undefined||
    changes.goal!==undefined||changes.caption!==undefined||changes.slides!==undefined)){
  const all=changes.topic!==undefined||changes.title!==undefined||
   changes.goal!==undefined||changes.caption!==undefined;
  const changed=new Set(changes.slides?.filter((s,i)=>s.text!==post.slides[i]?.text||
   s.id!==post.slides[i]?.id).map(s=>s.id)??[]);
  const validIds=new Set(result.slides.map(s=>s.id));
  result.research={...result.research,
   copyReviewed:all?false:result.research.copyReviewed,
   interpretationSlides:result.research.interpretationSlides.filter(
    id=>validIds.has(id)&&!changed.has(id)),
   sourceItems:result.research.sourceItems.filter(s=>validIds.has(s.slideId)).map(s=>
    all||changed.has(s.slideId)?{...s,reviewed:false}:s)};
 }
 if(changes.topic!==undefined||changes.title!==undefined||changes.goal!==undefined||
  changes.caption!==undefined||changes.slides!==undefined||changes.preset!==undefined||
  changes.fontPreset!==undefined){
  result.approvals.checklist=emptyChecklist();
  result.approvals.designApproved=false;result.approvals.designApprovedAt=null;
  result.approvals.contentHashAtDesignApproval='';
  if(changes.topic!==undefined||changes.title!==undefined||changes.goal!==undefined||
     changes.caption!==undefined||(changes.slides!==undefined&&
       (changes.slides.length!==post.slides.length||changes.slides.some((s,i)=>s.text!==post.slides[i]?.text)))){
   result.approvals.textApproved=false;result.approvals.textHashAtApproval='';
  }
  // Retain old fingerprint in audit to label the subsequent re-approval.
 }
 validatePost(result);return result;
}
export function approveEditorialStep(post:EditorialPost,step:'topic'|'content'|'design',now=new Date().toISOString()):EditorialPost{
 if(editorialStage(post)!==step)throw Error('Approve steps in order: topic, content, design');
 if(step==='topic'&&(!post.topic.trim()||!post.title.trim()||!post.goal.trim()))
  throw Error('Для утверждения нужна конкретная тема и редакционная задача');
 if(step==='content'&&(!post.caption.trim()||post.slides.some(s=>s.visual==='background'&&!s.text.trim())))
  throw Error('Заполни основной текст поста и тезисы на фоновых слайдах');
 if(step==='content'&&!editorialSourcesPass(post))throw Error('SOURCE_PASS: проверь каждый источник или явно отметь авторскую интерпретацию');
 if(step==='design'&&!editorialSourcesPass(post))throw Error('SOURCE_PASS: источники не проверены');
 if(step==='design'&&post.kind==='carousel'&&!editorialChecklistReady(post))
  throw Error('Заполни пункты 1–6 и проверь автоматический контраст перед утверждением');
 const approvals={...post.approvals,[step]:true};
 if(step==='content'&&post.kind==='carousel'){
  approvals.textApproved=true;approvals.textHashAtApproval=editorialTextHash(post);
  approvals.designApproved=false;approvals.designApprovedAt=null;
  approvals.contentHashAtDesignApproval='';
 }
 if(step==='design'&&post.kind==='carousel'){
  approvals.checklist=editorialChecklistState(post);
  approvals.checkedAt=now;approvals.checkedBy='Автор';
  approvals.contentHashAtApproval=editorialContentHash(post);
  approvals.textApproved=true;approvals.textHashAtApproval=editorialTextHash(post);
  approvals.designApproved=true;approvals.designApprovedAt=now;
  approvals.contentHashAtDesignApproval=editorialDesignHash(post);
 }
 const result={...post,revision:post.revision+1,updatedAt:now,approvals};
 validatePost(result);return result;
}
export function loadEditorialStore(storage:Pick<Storage,'getItem'>):EditorialStore{
 try{
  const raw=storage.getItem(EDITORIAL_KEY);if(!raw)return {version:1,posts:[]};
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||(parsed as EditorialStore).version!==1||
   !Array.isArray((parsed as EditorialStore).posts)||
   (parsed as EditorialStore).posts.length>200)return {version:1,posts:[]};
  const posts=(parsed as EditorialStore).posts.map(post=>{
   // Revocation on load is safer than hiding all drafts when an old review is stale.
   if(post.research&&(post.approvals?.content||post.approvals?.design)&&!editorialSourcesPass(post)){
    return {...post,approvals:{...post.approvals,content:false,design:false,
     designApproved:false,designApprovedAt:null,contentHashAtDesignApproval:'',
     textApproved:false,textHashAtApproval:'',checklist:emptyChecklist()}};
   }
   // Check saved manual approval before importing text approvals from the chat.
   if(post.kind==='carousel'&&post.approvals?.design&&post.approvals?.contentHashAtApproval&&
      post.approvals.contentHashAtApproval!==editorialContentHash(post)){
    const textMatches=post.approvals.textHashAtApproval===editorialTextHash(post);
    return applyChatCarouselApproval({...post,approvals:{...post.approvals,
     content:textMatches&&post.approvals.content,design:false,
     textApproved:textMatches&&Boolean(post.approvals.textApproved),
     designApproved:false,designApprovedAt:null,contentHashAtDesignApproval:'',
     checklist:emptyChecklist()}});
   }
   return applyChatCarouselApproval(post);
  });
  posts.forEach(validatePost);
  if(new Set(posts.map(x=>x.id)).size!==posts.length)return {version:1,posts:[]};
  return {version:1,posts};
 }catch{return {version:1,posts:[]}}
}
export function saveEditorialPost(storage:Pick<Storage,'getItem'|'setItem'>,post:EditorialPost):EditorialStore{
 validatePost(post);
 // A damaged or unknown versioned store must NEVER be replaced with an empty
 // collection: preserve the author's source bytes for manual recovery.
 const previousRaw=storage.getItem(EDITORIAL_KEY);
 if(previousRaw!==null){
  const currentCheck=loadEditorialStore(storage);
  if(currentCheck.posts.length===0){
   let parsed:unknown;
   try{parsed=JSON.parse(previousRaw)}catch{throw Error('Editorial storage invalid; refusing to overwrite')}
   if(!parsed||typeof parsed!=='object'||(parsed as EditorialStore).version!==1||
    !Array.isArray((parsed as EditorialStore).posts)||
    (parsed as EditorialStore).posts.length!==0)
    throw Error('Editorial storage invalid; refusing to overwrite');
  }
 }
 const current=loadEditorialStore(storage);
 const prev=current.posts.find(x=>x.id===post.id);
 if(prev&&post.revision<=prev.revision)throw Error('Editorial revision conflict; reload before editing');
 const next={version:1 as const,posts:[...current.posts.filter(x=>x.id!==post.id),post]};
 storage.setItem(EDITORIAL_KEY,JSON.stringify(next));return next;
}
export function loadStoryNotes(storage:Pick<Storage,'getItem'>):StoryNote[]{
 try{
  const raw=storage.getItem(STORY_KEY);if(!raw)return [];
  const value:unknown=JSON.parse(raw);
  if(!Array.isArray(value)||value.length>250||
   value.some(s=>typeof s?.id!=='string'||typeof s?.date!=='string'||
    !/^\d{4}-\d{2}-\d{2}$/.test(s.date)||typeof s?.text!=='string'||
    s.text.length>350||!['idea','captured','published'].includes(s.state)))return [];
  return value as StoryNote[];
 }catch{return []}
}
export function saveStoryNotes(storage:Pick<Storage,'setItem'>,notes:StoryNote[]){
 if(notes.length>250)throw Error('Story notes limit reached');
 storage.setItem(STORY_KEY,JSON.stringify(notes));
}
