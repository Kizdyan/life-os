/** Persona editorial pre-production: never equates a draft with an approved or published post.
 * This is a companion to existing PHOTO-001…010 ProductionJobs, not a second media job.
 * Local storage persists TEXT and editorial decisions. Image bytes live in IndexedDB.
 */
export const EDITORIAL_KEY='lifeos:persona:editorial-posts:v1';
export const STORY_KEY='lifeos:persona:weekly-stories:v1';
export const CAROUSEL_BASELINE_ID='carousel-baseline-pause';
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
export function editorialContentHash(post:Pick<EditorialPost,'title'|'topic'|'goal'|'caption'|'slides'|'preset'>):string{
 const bytes=new TextEncoder().encode(JSON.stringify([post.title,post.topic,post.goal,
  post.caption,post.preset,post.slides.map(s=>[s.id,s.text,s.visual,s.photoDirection])]));
 let hash=0x811c9dc5;for(const b of bytes)hash=Math.imul(hash^b,0x01000193)>>>0;
 return 'fnv1a32:'+hash.toString(16).padStart(8,'0');
}
export function editorialChecklistState(post:EditorialPost):boolean[]{
 const a=post.approvals.checklist??emptyChecklist();
 return [...a.slice(0,6),editorialContrastPass(post)];
}
export function editorialChecklistReady(post:EditorialPost):boolean{
 return post.kind==='carousel'&&editorialChecklistState(post).every(Boolean);
}
export function setEditorialChecklistItem(post:EditorialPost,index:number,checked:boolean,now=new Date().toISOString()):EditorialPost{
 if(post.kind!=='carousel'||editorialStage(post)!=='design')throw Error('Чек-лист доступен до утверждения оформления');
 if(!Number.isInteger(index)||index<0||index>5||typeof checked!=='boolean')throw Error('Пункт 7 проверяется автоматически');
 const checklist=editorialChecklistState(post);checklist[index]=checked;
 const result={...post,revision:post.revision+1,updatedAt:now,approvals:{...post.approvals,checklist}};
 validatePost(result);return result;
}

export type PostKind='carousel'|'photo';
export type SlideVisual='background'|'archive-photo';
export type EditorialPreset='ink'|'cream'|'chocolate'|'filmic'|'chocolate-graphite';
export type EditorialSlide={id:string;text:string;visual:SlideVisual;photoDirection:string};
export type EditorialPost={version:1;id:string;kind:PostKind;title:string;topic:string;
 goal:string;slides:EditorialSlide[];caption:string;preset:EditorialPreset;
 approvals:{topic:boolean;content:boolean;design:boolean;
 checklist?:boolean[];checkedAt?:string;checkedBy?:string;contentHashAtApproval?:string};
 createdAt:string;updatedAt:string;revision:number;
 origin:'seed-carousel'|'topic-choice'|'researched-topic';scheduledDate?:string};
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
 const steps=draft?.slides.length&&draft.slides.length>=3&&draft.slides.length<=7
  ?draft.slides.map(s=>s.title.trim().slice(0,170))
  :['Зацепка и вопрос зрителю','Конфликт или контраст','Новая деталь','Поворот в смысле','Незавершённый вывод'];
 const result:EditorialPost={version:1,id,kind:'carousel',title:title.trim(),topic:title.trim(),
  goal:angle.trim(),slides:steps.map((text,i)=>({id:'slide-'+(i+1),text,visual:'background',photoDirection:''})),
  caption:draft?.caption?.slice(0,4500)??'',preset:'ink',
  approvals:freshApproval(),origin:'researched-topic',
  revision:1,createdAt:now,updatedAt:now};
 validatePost(result);return result;
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
  caption:'Пауза в кадре — это не пустота, а решение. Персонаж, который молчит дольше, чем нужно реплике, уже что-то скрывает от собеседника или от себя. Задача актёра — не "держать паузу", а точно знать, что именно происходит внутри неё. Когда это знание есть, зритель читает его без слов. Когда его нет, пауза превращается в ожидание. Разница между ними — не в длительности, а в наличии внутреннего действия.',
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
  (post.scheduledDate!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(post.scheduledDate)||
   !Number.isFinite(Date.parse(post.scheduledDate+'T12:00:00Z'))||
   new Date(post.scheduledDate+'T12:00:00Z').toISOString().slice(0,10)!==post.scheduledDate))||
  !['ink','cream','chocolate','filmic','chocolate-graphite'].includes(post.preset)||
  !post.approvals||['topic','content','design'].some(k=>typeof post.approvals[k as keyof typeof post.approvals]!=='boolean')||
  !Number.isInteger(post.revision)||post.revision<1||!Number.isFinite(Date.parse(post.updatedAt))||
  !Array.isArray(post.slides)||post.slides.length!==(post.kind==='photo'?1:post.slides.length)||
  post.slides.length<(post.kind==='carousel'?3:1)||post.slides.length>(post.kind==='carousel'?7:1)||
  new Set(post.slides.map(s=>s.id)).size!==post.slides.length||
  post.slides.some(s=>!s.id||typeof s.text!=='string'||s.text.length>170||
   (post.approvals.content&&s.visual==='background'&&!s.text.trim())||
   !['background','archive-photo'].includes(s.visual)||typeof s.photoDirection!=='string'||s.photoDirection.length>350))
  throw Error('Invalid editorial project');
 if(post.approvals.content&&!post.approvals.topic)throw Error('Content approved before topic');
 if(post.approvals.design&&!post.approvals.content)throw Error('Design approved before content');
 if(post.approvals.content&&!post.caption.trim())throw Error('Caption required for approval');
}
export function reviseEditorialPost(post:EditorialPost,changes:Partial<Pick<EditorialPost,'topic'|'title'|'goal'|'caption'|'preset'|'slides'|'scheduledDate'>>,now=new Date().toISOString()):EditorialPost{
 const result={...post,...changes,updatedAt:now,revision:post.revision+1,
  approvals:{...post.approvals}};
 if(changes.topic!==undefined||changes.title!==undefined||changes.goal!==undefined)
  result.approvals={topic:false,content:false,design:false};
 else if(changes.caption!==undefined)
  result.approvals={...result.approvals,content:false,design:false};
 else if(changes.slides!==undefined){
  const copyChanged=changes.slides.length!==post.slides.length||
   changes.slides.some((s,i)=>s.id!==post.slides[i]?.id||s.text!==post.slides[i]?.text);
  result.approvals=copyChanged?{...result.approvals,content:false,design:false}:
   {...result.approvals,design:false};
 }else if(changes.preset!==undefined)
  result.approvals={...result.approvals,design:false};
 validatePost(result);return result;
}
export function approveEditorialStep(post:EditorialPost,step:'topic'|'content'|'design',now=new Date().toISOString()):EditorialPost{
 const stage=editorialStage(post);
 if(stage!==step)throw Error('Approve steps in order: topic, content, design');
 if(step==='topic'&&(!post.topic.trim()||!post.title.trim()||!post.goal.trim()))
  throw Error('Для утверждения нужна конкретная тема и редакционная задача');
 if(step==='content'&&(!post.caption.trim()||post.slides.some(s=>s.visual==='background'&&!s.text.trim())))
  throw Error('Заполни основной текст поста и тезисы на фоновых слайдах');
 const result={...post,revision:post.revision+1,updatedAt:now,
  approvals:{...post.approvals,[step]:true}};validatePost(result);return result;
}
export function loadEditorialStore(storage:Pick<Storage,'getItem'>):EditorialStore{
 try{
  const raw=storage.getItem(EDITORIAL_KEY);if(!raw)return {version:1,posts:[]};
  const parsed:unknown=JSON.parse(raw);
  if(!parsed||typeof parsed!=='object'||(parsed as EditorialStore).version!==1||
   !Array.isArray((parsed as EditorialStore).posts)||
   (parsed as EditorialStore).posts.length>200)return {version:1,posts:[]};
  const posts=(parsed as EditorialStore).posts;
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
