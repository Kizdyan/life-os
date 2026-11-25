import {createResearchedEditorialPost,validatePost,type EditorialPost,type EditorialResearch} from './personaEditorialModel';

/** A research packet is externally supplied evidence, NEVER proof that its claims are true. */
export type ResearchPacket={
 title:string;angle:string;caption:string;
 slides:{text:string;visualDirection?:string;interpretation?:boolean;sources?:{title:string;url:string}[]}[];
};
export const RESEARCH_CAROUSEL_EXAMPLE:ResearchPacket={
 title:'Как звук создаёт напряжение в кино',
 angle:'Показать неожиданную проверяемую историю и профессиональный принцип',
 caption:'Источники и проверка фактов — до публикации.',
 slides:[
  {text:'Обложка: проверяемый факт',sources:[{title:'Первоисточник',url:'https://example.org/source'}]},
  {text:'Что произошло?',sources:[{title:'Первоисточник',url:'https://example.org/source'}]},
  {text:'Что удивило создателей?',sources:[{title:'Первоисточник',url:'https://example.org/source'}]},
  {text:'Как это работает?',sources:[{title:'Профессиональная публикация',url:'https://example.org/details'}]},
  {text:'Наш вывод — интерпретация, а не цитата',interpretation:true}
 ]
};

/** Copy-and-paste prompt. Provider connection is not implied or silently simulated. */
export const RESEARCH_PROMPT=`Исследуй 5–8 проверяемых, небанальных фактов о кино, актёрстве, музыке или режиссуре для личного профиля актёра, композитора и режиссёра. Выбери ОДНУ сильную историю. Проверь каждое утверждение по первоисточнику или надёжному отраслевому материалу. Не выдумывай источники, цитаты, даты и исторические детали. Верни ТОЛЬКО валидный JSON без Markdown по схеме:
{
 "title":"Название до 160 символов",
 "angle":"Почему эта история интересна зрителю и демонстрирует профессиональный взгляд",
 "caption":"Подпись к публикации",
 "slides":[
   {"text":"Текст первого слайда, до 260 символов", "visualDirection":"Визуал без чужих лиц, связанный с фактом",
    "sources":[{"title":"Название источника","url":"https://источник"}]},
   {"text":"Второй слайд — новое обстоятельство","sources":[{"title":"Название","url":"https://источник"}]},
   {"text":"Третий слайд — неожиданная подробность","sources":[{"title":"Название","url":"https://источник"}]},
   {"text":"Четвёртый слайд — поворот","sources":[{"title":"Название","url":"https://источник"}]},
   {"text":"Пятый слайд — авторский вывод без новых фактических утверждений","interpretation":true}
 ]
}
Нужно ровно 5–8 слайдов; у каждого фактического слайда минимум одна прямая ссылка, у чисто авторского вывода interpretation:true. Слайды должны образовывать причинно-следственную историю: интрига → новые открытия → неожиданная деталь → содержательный финал. Для художественного слайда можно разделить поле text пустой строкой на заголовок, основной абзац и короткий курсивный акцент (не более 3 блоков); после такой разбивки весь текст всё равно до 260 символов. Не добавляй нумерацию, имя автора, шаблонные советы или фразы про Persona. Не называй мнение доказанным фактом. Реальные URL нужны, но их фактическое содержание автор ещё проверит вручную.
Редакционный стандарт после первой публикации: читатель не обязан знать произведение, сюжет или участников. Уже на первом слайде назови тип произведения (например, фильм) и его название; хук — конкретное удивление, допустимы многоточие и вопрос, но не обязательны и не должны искажать факт. При первом появлении фамилии или персонажа назови профессию/роль и связь с историей. В подписи контекст тоже должен быть понятен независимо от слайдов. Каждый слайд отвечает на вопрос, оставшийся от предыдущего, и приближает к выводу: загадка → контекст → факт → механизм → поворот → профессиональная позиция. Расшифруй непонятные термины и причинно-следственные связи; не используй обороты вроде «привычный жанр» без объяснения. Финал раскрывает, чему учит история актёра, композитора или режиссёра, без выдуманных личных заслуг автора. Планируй headline, body и короткий акцент как разные смысловые уровни; выделяй только ключевое, обеспечь читаемость и место для текста, предлагай уместный цветовой акцент в visualDirection. Сохраняй точные ссылки в sources, не вставляй технический список источников и URL в публичную подпись; при необходимости оставь естественную атрибуцию имени или произведения.`;

function object(input:unknown):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Нужен JSON-объект исследования');
 return input as Record<string,unknown>;
}
function field(value:unknown,max:number,name:string):string{
 if(typeof value!=='string'||!value.trim()||value.length>max)
  throw Error(name+': обязательный текст, максимум '+max+' символов');
 return value.trim();
}
function validSourceUrl(raw:string):boolean{
 try{
  const url=new URL(raw);
  return (url.protocol==='https:'||url.protocol==='http:')&&Boolean(url.hostname)&&
   !url.username&&!url.password&&url.hostname!=='localhost'&&
   !/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname);
 }catch{return false}
}
/** Strictly parse research. No model/network call and no fabricated sources. */
export function parseResearchPacket(json:string):ResearchPacket{
 if(json.length>32000)throw Error('Исследование слишком большое (максимум 32 КБ)');
 let parsed:unknown;
 try{parsed=JSON.parse(json)}catch{throw Error('Неверный JSON исследования')}
 const p=object(parsed);
 if(!Array.isArray(p.slides)||p.slides.length<5||p.slides.length>8)
  throw Error('Нужно 5–8 содержательных слайдов (на текущем этапе)');
 const slides=p.slides.map((raw,i)=>{
  const s=object(raw),text=field(s.text,260,'Слайд '+(i+1));
  const visualDirection=s.visualDirection===undefined?'':field(s.visualDirection,350,'Визуальное решение '+(i+1));
  if(s.interpretation!==undefined&&typeof s.interpretation!=='boolean')
   throw Error('interpretation должен быть true или false');
  const interpretation=s.interpretation===true;
  const sources=s.sources===undefined?[]:s.sources;
  if(!Array.isArray(sources)||sources.length>4)
   throw Error('Для каждого слайда максимум 4 источника');
  const checked=sources.map((rawSource,j)=>{
   const x=object(rawSource);
   const title=field(x.title,160,'Название источника '+(j+1));
   const url=field(x.url,2048,'URL источника '+(j+1));
   if(!validSourceUrl(url))throw Error('Недопустимый URL источника на слайде '+(i+1));
   return {title,url};
  });
  if(!interpretation&&checked.length===0)
   throw Error('Для слайда '+(i+1)+' нужен источник либо явная пометка interpretation:true');
  if(new Set(checked.map(x=>x.url)).size!==checked.length)
   throw Error('Повторяется источник на слайде '+(i+1));
  return {text,visualDirection,interpretation,sources:checked};
 });
 return {title:field(p.title,160,'Тема'),angle:field(p.angle,500,'Редакционная задача'),
  caption:field(p.caption,4500,'Подпись'),slides};
}
/** Creates an UNAPPROVED editorial project inside the pre-existing approval flow. */
export function importResearchCarousel(id:string,json:string,now?:string,receipt?:NonNullable<EditorialResearch['discovery']>):EditorialPost{
 const packet=parseResearchPacket(json);
 const seed=createResearchedEditorialPost(id,packet.title,packet.angle,
  {caption:packet.caption,slides:packet.slides.map(s=>({title:s.text,body:''}))},now);
 const research:EditorialResearch={
  provider:receipt?'perplexity':'manual',
  ...(receipt?{discovery:receipt}:{}),
  sourceItems:packet.slides.flatMap((slide,i)=>(slide.sources??[]).map(source=>({
   slideId:seed.slides[i].id,title:source.title,url:source.url,reviewed:false
  }))),
  interpretationSlides:packet.slides.flatMap((slide,i)=>slide.interpretation?[seed.slides[i].id]:[])
 };
 const post:EditorialPost={...seed,research,preset:'chocolate-graphite',
  slides:seed.slides.map((slide,i)=>({...slide,text:packet.slides[i].text,
   photoDirection:packet.slides[i].visualDirection??''}))};
 validatePost(post);
 return post;
}
