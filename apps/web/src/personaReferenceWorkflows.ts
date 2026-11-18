/** Practical lessons from five user-supplied reference videos. No borrowed
 * footage, fake audience analytics, silent publishing or unverified AI success.
 * Evidence tiers: observed-video, provider-documented, unverified-creator-claim.
 */
export const REFERENCE_LAB_KEY='lifeos:persona:reference-workflows:v1';
export type Audience='industry'|'viewers'|'clients';
export type ReferenceSource={id:string;url:string;finding:string;status:'unverified'|'reviewed'};
export type FactoryItem={id:string;title:string;format:'reel'|'carousel';state:'idea'|'selected';sourceId?:string};
export type TrialVariant={id:string;hook:string;state:'draft'|'shared_manually'|'metrics_entered'|'released_manually';
 audioNote?:string;visualNote?:string;plannedDate?:string;
 views?:number;likes?:number;comments?:number;shares?:number;checkedAt?:string};
export type TrialCampaign={id:string;title:string;sourceProjectId?:string;createdAt:string;variants:TrialVariant[]};
export type CapturePreset={device:'iphone'|'android'|'camera';codec:'hevc'|'h264'|'prores';resolution:'1080p'|'4k';
 fps:24|25|30|60;vertical:boolean;whiteBalanceLocked:boolean;exposureLocked:boolean};
export type ReferenceLabState={version:1;revision:number;topic:string;audience:Audience;researchNotes:string;
 sources:ReferenceSource[];batch:FactoryItem[];trials:TrialCampaign[];capture:CapturePreset};
export type ReferenceInsight={
 id:'audience-prompts'|'batch-production'|'trial-reels'|'edits-mcp'|'blackmagic-camera';
 file:string;durationSeconds:number;observed:string;adaptation:string;limit:string;
};
export const REFERENCE_INSIGHTS:ReferenceInsight[]=[
 {id:'audience-prompts',file:'16a5100aa2b44ab39542aa5934317736.mp4',durationSeconds:65.1,
  observed:'Показывается двухшаговый приём: сначала искать проблемы аудитории, затем строить сценарий вокруг выбранной проблемы.',
  adaptation:'Исследовательский бриф с источниками, проверкой интереса и отдельным сценарием.',
  limit:'Просмотры из примера и слово «вирусный» не доказывают вероятность успеха.'},
 {id:'batch-production',file:'39635b14ba474925a3dd3a91e8e82778.mp4',durationSeconds:46.67,
  observed:'Автор демонстрирует подбор фрагментов из своей медиатеки с помощью Claude и заявляет о большом числе подготовленных роликов.',
  adaptation:'Пакетная очередь идей с выбором архивных материалов, проверкой и отдельным подтверждением каждого результата.',
  limit:'Заявленные 99 видео не подтверждены исходными файлами или качеством; создание плана не считается рендером.'},
 {id:'trial-reels',file:'d9419f5e3ba64dd1b9e7d434b44247da.mp4',durationSeconds:50,
  observed:'Показаны Trial Reels, разные версии одного материала и сравнение результатов после размещения.',
  adaptation:'Пять гипотез первых секунд, ручная фиксация Trial-статуса и исходных метрик, сравнение гипотез.',
  limit:'Не создаём автоматическое размещение и не выдаём различие просмотров за причинный эффект.'},
 {id:'edits-mcp',file:'7a5ebdc350e94d9a93b3abdfbf0e9e9b.mp4',durationSeconds:34.9,
  observed:'Показана настройка Automation Server в настольном Edits и подключение Claude Code.',
  adaptation:'Выбор движка по среде: Edits MCP только на поддерживаемом Mac; Windows — существующий FFmpeg-процесс.',
  limit:'Edits Desktop MCP не работает нативно на Windows; токены не сохраняются и автопостинг не обещается.'},
 {id:'blackmagic-camera',file:'71e01041c7b0491fbfa4df6964f0a5e6.mp4',durationSeconds:36.57,
  observed:'Показаны вертикальный режим Blackmagic Camera, кодек, битрейт, разрешение и настройки камеры.',
  adaptation:'Съёмочный чек-лист со стандартным профилем, фиксацией баланса белого и экспозиции.',
  limit:'ProRes/Log/Open Gate и частоты кадров зависят от модели устройства; выбор профиля не меняет настройки телефона.'}
];
export const defaultCapture:CapturePreset={device:'iphone',codec:'hevc',resolution:'4k',fps:30,
 vertical:true,whiteBalanceLocked:true,exposureLocked:true};
export function emptyReferenceLab():ReferenceLabState{
 return {version:1,revision:1,topic:'',audience:'industry',researchNotes:'',sources:[],batch:[],trials:[],capture:{...defaultCapture}};
}
export function validateReferenceLab(state:ReferenceLabState):void{
 if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<1||
  typeof state.topic!=='string'||state.topic.length>170||
  !['industry','viewers','clients'].includes(state.audience)||
  typeof state.researchNotes!=='string'||state.researchNotes.length>4000||
  !Array.isArray(state.sources)||state.sources.length>40||
  !Array.isArray(state.batch)||state.batch.length>30||
  !Array.isArray(state.trials)||state.trials.length>30||
  !state.capture||!['iphone','android','camera'].includes(state.capture.device)||
  !['hevc','h264','prores'].includes(state.capture.codec)||
  !['1080p','4k'].includes(state.capture.resolution)||
  ![24,25,30,60].includes(state.capture.fps)||
  ['vertical','whiteBalanceLocked','exposureLocked'].some(k=>typeof state.capture[k as keyof CapturePreset]!=='boolean'))
  throw Error('Некорректные настройки исследовательской мастерской');
 const allIds=[...state.sources.map(s=>s.id),...state.batch.map(s=>s.id),...state.trials.map(s=>s.id)];
 if(new Set(allIds).size!==allIds.length)throw Error('Повторяющиеся ID в исследовательской мастерской');
 if(state.sources.some(x=>typeof x.id!=='string'||x.id.length>100||
  typeof x.url!=='string'||x.url.length>800||!/^https:\/\/\S+$/u.test(x.url)||
  typeof x.finding!=='string'||x.finding.length>1200||
  !['unverified','reviewed'].includes(x.status)))throw Error('Недопустимая ссылка исследования');
 if(state.batch.some(x=>typeof x.id!=='string'||!x.id||typeof x.title!=='string'||
  !x.title.trim()||x.title.length>160||!['reel','carousel'].includes(x.format)||
  !['idea','selected'].includes(x.state)))throw Error('Недопустимая очередь');
 if(state.trials.some(t=>!t.id||typeof t.title!=='string'||t.title.length>160||
  !Number.isFinite(Date.parse(t.createdAt))||t.variants.length!==5||
  new Set(t.variants.map(v=>v.id)).size!==5||t.variants.some(v=>!v.id||!v.hook||
   v.hook.length>180||!['draft','shared_manually','metrics_entered','released_manually'].includes(v.state)||
   (v.audioNote!==undefined&&(typeof v.audioNote!=='string'||v.audioNote.length>180))||
   (v.visualNote!==undefined&&(typeof v.visualNote!=='string'||v.visualNote.length>180))||
   (v.plannedDate!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.plannedDate)||
    !Number.isFinite(Date.parse(v.plannedDate+'T12:00:00Z'))||
    new Date(v.plannedDate+'T12:00:00Z').toISOString().slice(0,10)!==v.plannedDate))||
   ['views','likes','comments','shares'].some(k=>v[k as keyof TrialVariant]!==undefined&&
    (!Number.isSafeInteger(v[k as keyof TrialVariant])||(v[k as keyof TrialVariant] as number)<0)))))
  throw Error('Недопустимый Trial Reels эксперимент');
}
export function loadReferenceLab(storage:Pick<Storage,'getItem'>):ReferenceLabState{
 const raw=storage.getItem(REFERENCE_LAB_KEY);if(raw===null)return emptyReferenceLab();
 let parsed:ReferenceLabState;
 try{parsed=JSON.parse(raw)}catch{throw Error('Исследовательские данные повреждены. Не перезаписываем их.')}
 validateReferenceLab(parsed);return parsed;
}
export function saveReferenceLab(storage:Pick<Storage,'getItem'|'setItem'>,next:ReferenceLabState):ReferenceLabState{
 validateReferenceLab(next);const current=loadReferenceLab(storage);
 if(next.revision!==current.revision+1)throw Error('Конфликт версий. Перезагрузи данные.');
 storage.setItem(REFERENCE_LAB_KEY,JSON.stringify(next));return next;
}
export function reviseReferenceLab(state:ReferenceLabState,changes:Partial<Omit<ReferenceLabState,'version'|'revision'>>):ReferenceLabState{
 const next={...state,...changes,revision:state.revision+1};validateReferenceLab(next);return next;
}
export function researchPrompt(topic:string,audience:Audience):string{
 const target={industry:'режиссёры, продюсеры, кастинг-директора и бренды',viewers:'зрители кино, театра и музыкальных историй',
  clients:'заказчики оригинальной музыки, аранжировок и актёрской работы'}[audience];
 return [
  'Роль: исследователь контента с проверяемыми источниками.',
  'Контекст автора: актёр, композитор и начинающий режиссёр; цель — профессиональные контакты, роли и узнаваемость.',
  'Тема: '+(topic.trim()||'[выбранная автором тема]')+'. Целевая аудитория: '+target+'.',
  'Найди до 10 конкретных вопросов, трудностей, противоречий или наблюдений этой аудитории.',
  'Для каждой гипотезы: интерес зрителя, почему вопрос не банален, пригодность для Reel/карусели, реальный пример,',
  'ссылка на первоисточник и дата. Если ссылки нет, пометь как гипотезу, не выдумывай статистику.',
  'Не использовать достижения и биографические факты автора без проверки.',
  'Верни 3 сильнейших направления с рисками и объяснением, какой тип контента подходит лучше.',
 ].join('\n');
}
export function scenarioPrompt(topic:string,notes:string):string{
 return [
  'Роль: профессиональный драматург и редактор коротких форм.',
  'Используй утверждённую проблему аудитории, а НЕ общую просьбу «сделай вирусный сценарий».',
  'Тема: '+(topic.trim()||'[уточни тему]'),
  'Проверенные материалы / наблюдения автора: '+(notes.trim().slice(0,4000)||'[данных ещё нет; не выдумывай факты]'),
  'Предложи три различающиеся концепции: конфликт, зацепка в первые секунды, поворот,',
  'что реально нужно снять и какие архивные материалы пригодятся.',
  'Для карусели: 3–7 коротких слайдов, а основной содержательный текст — ПОД каруселью.',
  'Для Reels: конкретные кадры и реплики. Отдельно перечисли то, что потребуется проверить у автора.',
  'Не обещай гарантированных просмотров и не подменяй исследование догадками.',
 ].join('\n');
}
export function makeFactoryBatch(titles:string,format:'reel'|'carousel',now=Date.now()):FactoryItem[]{
 const unique=[...new Set(titles.split(/\r?\n/u).map(x=>x.trim()).filter(Boolean))].slice(0,20);
 if(unique.some(x=>x.length>160)||unique.length===0)throw Error('Нужно от 1 до 20 коротких тем');
 return unique.map((title,i)=>({id:'batch-'+now+'-'+String(i+1),title,format,state:'idea'}));
}
const HOOK_TYPES=[
 'Контраст: что кажется очевидным, но происходит иначе',
 'Вопрос: чем зритель рискует или что он хочет узнать',
 'Конфликт: два несовместимых желания',
 'Поворот: ожидание и другое последствие',
 'Взгляд изнутри: реальный рабочий выбор автора'
] as const;
export function makeTrialCampaign(title:string,now='2026-11-19T00:00:00Z',id='trial-'+Date.now()):TrialCampaign{
 if(!title.trim()||title.length>160)throw Error('Сначала укажи конкретную тему Reel');
 const t=new Date(now);if(!Number.isFinite(t.getTime()))throw Error('Некорректная дата эксперимента');
 return {id,title:title.trim(),createdAt:now,variants:HOOK_TYPES.map((hook,i)=>{
  const date=new Date(t);date.setUTCDate(date.getUTCDate()+i*7);
  return {id:id+'-v'+(i+1),hook,state:'draft',plannedDate:date.toISOString().slice(0,10),
   audioNote:'',visualNote:''};
 })};
}
export function trialObservations(trial:TrialCampaign):{id:string;shareRate:number;views:number}[]{
 // Exploratory share-per-view ONLY; not randomized A/B test or guaranteed winner.
 return trial.variants.filter(v=>v.views!==undefined&&v.views>0&&v.shares!==undefined).map(v=>({
  id:v.id,views:v.views!,shareRate:Math.round((v.shares!/v.views!)*10000)/100
 })).sort((a,b)=>b.shareRate-a.shareRate);
}
export function captureChecklist(p:CapturePreset):{items:string[];warnings:string[]}{
 const items=[
  'Оригинальные исходники сохранять без перезаписи; начать с теста на 10–15 секунд.',
  'Проверить свет, лицо и фон: естественный цвет кожи и отсутствие пересветов.',
  'Заблокировать баланс белого на время кадра, если приложение и модель позволяют.',
  'Заблокировать экспозицию/фокус после выбора ракурса, если это доступно.',
  'Проверить внешний или встроенный микрофон, шум помещения и пики звука.',
  'Снимать в '+(p.vertical?'вертикальной':'горизонтальной')+' ориентации, '+p.resolution+' / '+p.fps+' fps, '+p.codec.toUpperCase()+'.',
  'Перед публикацией измерить реальный файл FFprobe и проверить цвет после экспортного перекодирования.'
 ];
 const warnings=[
  'Профиль — памятка, а не удалённая настройка Blackmagic Camera.',
  'Поддержка кодека, LOG, Open Gate, кадровой частоты и ProRes зависит от конкретного телефона.',
  'При неподдерживаемом профиле использовать HEVC/H.264 и SDR Rec.709; не выдавать HDR за корректный цвет.'
 ];
 if(p.codec==='prores')warnings.unshift('ProRes может быть недоступен на этой модели; проверить наличие в приложении и свободную память.');
 if(p.fps===60)warnings.unshift('60 fps требует больше света и места; не включать без задачи по движению.');
 if(!p.whiteBalanceLocked)warnings.unshift('Риск изменения цветовой температуры в дубле: проверь автоматический WB.');
 if(!p.exposureLocked)warnings.unshift('Риск скачков яркости в дубле: проверь автоматическую экспозицию.');
 return {items,warnings};
}
export function editsSupport(os:'windows'|'mac'|'unknown'){
 if(os==='mac')return {supported:true,label:'Edits Desktop MCP доступен при локальной установке и явной авторизации.',
  warning:'Сначала прочти возможности установленной версии. Токен нельзя публиковать, пересылать или встраивать в проект.'};
 return {supported:false,label:os==='windows'?'Windows: используем существующий FFmpeg / Remotion Worker.':'ОС не подтверждена: интеграция Edits не активна.',
  warning:'Настольный Edits MCP подтверждён для macOS, но не для Windows. Не устанавливаем непроверенные посредники.'};
}
