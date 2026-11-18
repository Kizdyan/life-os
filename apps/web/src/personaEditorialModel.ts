/** Persona editorial pre-production: never equates a draft with an approved or published post.
 * This is a companion to existing PHOTO-001…010 ProductionJobs, not a second media job.
 * Local storage persists TEXT and editorial decisions. Image bytes live in IndexedDB.
 */
export const EDITORIAL_KEY='lifeos:persona:editorial-posts:v1';
export const STORY_KEY='lifeos:persona:weekly-stories:v1';
export type PostKind='carousel'|'photo';
export type SlideVisual='background'|'archive-photo';
export type EditorialPreset='ink'|'cream'|'chocolate'|'filmic';
export type EditorialSlide={id:string;text:string;visual:SlideVisual;photoDirection:string};
export type EditorialPost={version:1;id:string;kind:PostKind;title:string;topic:string;
 goal:string;slides:EditorialSlide[];caption:string;preset:EditorialPreset;
 approvals:{topic:boolean;content:boolean;design:boolean};createdAt:string;updatedAt:string;revision:number;
 origin:'seed-carousel'|'topic-choice';scheduledDate?:string};
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
  caption:seed.caption,preset:'ink',approvals:{topic:false,content:false,design:false},
  createdAt:now,updatedAt:now,revision:1,origin:'seed-carousel'
 };
}
export function createEditorialFromTopic(id:string,choice:TopicChoice,now=new Date().toISOString()):EditorialPost{
 if(!id||!/^[a-zA-Z0-9-]{3,75}$/.test(id)||!TOPIC_CHOICES.some(x=>x.id===choice.id))
  throw Error('Unknown topic selection');
 return {version:1,id,kind:choice.kind,title:choice.title,topic:choice.title,goal:choice.angle,
  slides:choice.slides.map((text,i)=>({id:'slide-'+(i+1),text,visual:choice.kind==='photo'?'archive-photo':'background',
   photoDirection:choice.photoDirection})),
  caption:choice.caption,preset:'ink',approvals:{topic:false,content:false,design:false},
  origin:'topic-choice',createdAt:now,updatedAt:now,revision:1};
}
export function editorialStage(post:EditorialPost):'topic'|'content'|'design'|'production'{
 if(!post.approvals.topic)return 'topic';
 if(!post.approvals.content)return 'content';
 if(!post.approvals.design)return 'design';
 return 'production';
}
export function editorialStageLabel(post:EditorialPost):string{
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
  (post.scheduledDate!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(post.scheduledDate))||
  !['ink','cream','chocolate','filmic'].includes(post.preset)||
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
 validatePost(post);const current=loadEditorialStore(storage);
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
