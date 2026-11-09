import{env,json}from'./_media-session.js';
import {personaAgentSystemPrompt} from '../packages/core/src/persona-agent-system-prompts.js';

type Idea={id:string;title:string;angle:string;format:'carousel'|'photo'|'reel'|'short'|'story';score:number;reason?:string;source?:string;status?:string};
type Slide={eyebrow:string;title:string;body:string};
type Draft={title:string;slides:Slide[];caption:string;platformNotes:{instagram:string;vk:string;youtube:string};style?:'editorial'|'old-money'|'documentary'|'minimal';assetInstruction?:string;learnedRules?:string[];changeSummary?:string};
type QA={pass:boolean;score:number;issues:{target:string;instruction:string}[]};
const model=()=>env('PERSONA_OPENAI_MODEL')||'gpt-5.6-sol';
function extract(text:string){const t=text.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();return JSON.parse(t)}
function clean(s:string){return String(s||'').replace(/\bPERSONA\b\s*[·•—:-]*\s*/giu,'').replace(/\bПерсона\b\s*[·•—:-]*\s*/giu,'').replace(/\s{2,}/g,' ').trim()}
function localIdeas(history:any[]=[]):Idea[]{const blocked=new Set(history.filter(x=>x?.status==='used'||x?.status==='rejected').map(x=>String(x.title).toLowerCase()));const seed:[string,string,Idea['format'],string][]=[['Что зритель не видит за минуту до спектакля','Закулисье через один конкретный момент','carousel','theatre'],['Почему хорошая сцена начинается до выхода на сцену','Подготовка как часть профессии','reel','theatre'],['Как четыре ноты превращаются в сцену','Музыкальное зерно → драматургия → оркестр','carousel','music'],['Одна ошибка, которая сделала сцену сильнее','Конфликт, решение и результат','carousel','process'],['Что актёр делает, когда проба не получается','Честный процесс без образа успеха','carousel','acting'],['Как рождается аранжировка','От фортепиано до готового звучания','reel','music'],['Что меняется после сотни проб','Наблюдение без мотивационного пафоса','short','acting'],['Один день между театром и музыкой','Соединить две профессии одной историей','reel','journey'],['Почему красивого кадра недостаточно','Смысл важнее визуального блеска','photo','positioning'],['Фрагмент будущего мюзикла','Тизер проекта без спойлеров','short','musical'],['Три вещи, которые зритель не замечает','Curiosity gap + конкретные детали','carousel','theatre'],['Из заметки в готовую сцену','Показать реальный творческий pipeline','reel','process'],['Что происходит после «стоп, снято»','Показать момент, который обычно вырезают','reel','film'],['Как понять, что идея для поста слабая','Показать самопроверку автора до публикации','carousel','marketing'],['Почему я не хочу показывать только результат','Личный манифест о процессе','carousel','positioning'],['Одна репетиция, которую стоило бы увидеть зрителю','Невидимая работа перед спектаклем','reel','theatre'],['Как одна фраза меняет весь номер','Драматургия через микродеталь','carousel','musical'],['Что показать человеку, который впервые пришёл в театр','Вход в мир через личное наблюдение','photo','theatre'],['Почему некоторые идеи лучше оставить на потом','Как работает творческий банк','carousel','process'],['Что реально помогает пережить провальную пробу','Практический опыт без наставничества','carousel','acting'],['Как один предмет может рассказать о роли','Предмет как драматургический якорь','photo','acting'],['Что остаётся после репетиции','Один честный кадр вместо отчёта','photo','theatre'],['Как понять, что сцена уже живая','Признаки, которые замечает актёр','carousel','craft'],['Почему процесс иногда интереснее результата','История через незавершённость','carousel','positioning']];return seed.filter(x=>!blocked.has(x[0].toLowerCase())).map((x,i)=>({id:`idea-${i+1}`,title:x[0],angle:x[1],format:x[2],source:x[3],score:96-i*2,reason:'Баланс личного процесса, профессиональной глубины и интереса аудитории',status:'candidate'}))}
function localDraft(idea:Idea,assetName=''):Draft{const style:Draft['style']=idea.format==='photo'?'old-money':idea.format==='reel'||idea.format==='short'?'documentary':'editorial';const slides:Slide[]=[{eyebrow:'ПЕРВЫЙ КАДР',title:idea.title,body:idea.angle+'. Но интереснее всего то, что обычно остаётся за кадром.'},{eyebrow:'01',title:'Сначала — конкретный момент',body:'Не общий рассказ о профессии, а один эпизод, который можно увидеть, услышать или почувствовать.'},{eyebrow:'02',title:'Потом — напряжение',body:'Что было не так? Что пришлось решить? Именно здесь появляется история, а не просто информация.'},{eyebrow:'03',title:'Показываем процесс',body:'Зритель получает то, чего обычно не видит: решение, сомнение, пробу, ошибку или маленькую деталь.'},{eyebrow:'04',title:'И только потом — вывод',body:'Не морализаторство, а мысль, которую хочется унести с собой.'},{eyebrow:'ПРОДОЛЖЕНИЕ',title:'Если интересен процесс',body:'Следующим материалом можно показать реальный пример — без глянца и постановочного backstage.'}];return{title:clean(idea.title),slides,caption:`${idea.title}.\n\n${idea.angle}. Мне интереснее показывать не только результат, но и то, как он собирается: решения, ошибки, детали и моменты, которые обычно остаются за кадром.\n\nЕсли интересен сам процесс — дальше покажу его на реальных примерах.`,platformNotes:{instagram:'Основной формат: 4:5 карусель или вертикальное видео. Первый экран — короткий хук.',vk:'Тот же материал, но подпись можно расширить.',youtube:'Развернуть тему в Short или более длинное видео, если есть исходник.'},style,assetInstruction:assetName?`Исходник ${assetName} принят. Визуальная редактура: ${style}.`:'Для визуального производства нужен исходник.'}}
function localRevise(draft:Draft,feedback:string):{draft:Draft;learnedRules:string[];changeSummary:string}{const t=feedback.toLowerCase();const out:Draft=JSON.parse(JSON.stringify(draft));const rules:string[]=[];if(/persona|персон/u.test(t)&&/(убер|не долж|не должно|исключительно для нас|внутрен)/u.test(t)){out.title=clean(out.title);out.caption=clean(out.caption);out.slides=out.slides.map(s=>({...s,eyebrow:clean(s.eyebrow),title:clean(s.title),body:clean(s.body)}));rules.push('Не использовать внутреннее название системы в публичном материале.')}if(/читаб|налез|перегруж|много текста|короч|дизайн/u.test(t)){out.slides=out.slides.map(s=>({...s,title:s.title.length>58?s.title.slice(0,55).replace(/\s+\S*$/u,'')+'…':s.title,body:s.body.length>155?s.body.slice(0,152).replace(/\s+\S*$/u,'')+'…':s.body}));rules.push('Карточки должны быть короткими и легко читаться на iPhone.')}if(/маркет|цепля|интерес|подпис|прода/u.test(t)){out.slides[0]={...out.slides[0],body:'Первый экран должен вызвать любопытство, а дальше материал обязан быстро дать обещанный ответ.'};out.caption=out.caption.replace(/Если интересен сам процесс — дальше покажу его на реальных примерах\.?/u,'Если этот процесс действительно интересен — продолжу показывать его на реальных примерах.');rules.push('Хук и причина следить дальше должны быть естественными, без дешёвого кликбейта.')}if(/old money|олд мани/u.test(t))out.style='old-money';if(/минимал|minimal/u.test(t))out.style='minimal';if(/документал|documentary|живой/u.test(t))out.style='documentary';return{draft:out,learnedRules:rules,changeSummary:rules.length?`Применены смысловые правки: ${rules.join(' ')}`:'Команда применена как редакторская правка ко всему материалу.'}}
function localQA(draft:Draft):QA{const issues:QA['issues']=[];const all=[draft.title,draft.caption,...draft.slides.flatMap(s=>[s.eyebrow,s.title,s.body])].join(' ');if(/\bpersona\b|\bперсона\b/iu.test(all))issues.push({target:'writer',instruction:'Убрать внутреннее название системы из публичного материала.'});if(draft.slides.some(s=>s.title.length>72||s.body.length>190))issues.push({target:'designer',instruction:'Сократить перегруженные карточки для мобильного экрана.'});const titles=draft.slides.map(s=>s.title.toLowerCase());if(new Set(titles).size!==titles.length)issues.push({target:'writer',instruction:'Убрать повторяющиеся заголовки.'});if(draft.slides.length<5||draft.slides.length>8)issues.push({target:'writer',instruction:'Сделать 5–8 карточек с одной мыслью на экран.'});if(!draft.caption.trim())issues.push({target:'marketing',instruction:'Добавить полноценную подпись и естественный CTA.'});return{pass:issues.length===0,score:Math.max(0,100-issues.length*20),issues}}
async function openAI(system:string,payload:any){const key=env('OPENAI_API_KEY')||env('openai_api_key');if(!key)throw new Error('no_openai_key');const r=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:model(),messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(payload)}],response_format:{type:'json_object'}})});if(!r.ok)throw new Error(`openai_${r.status}`);const data:any=await r.json();return extract(data.choices?.[0]?.message?.content||'')}
const planSystem=`Ты — стратег личного медиа. Сгенерируй 16–24 свежих идей для актёра/музыканта/автора, учитывая историю уже использованных и отклонённых тем. Не повторяй темы. Балансируй театр, кино, музыку, собственные проекты, процесс, личные наблюдения. Каждая идея должна иметь сильный curiosity gap, понятный формат и причину, почему её стоит выпускать сейчас. Верни JSON {"ideas":[{"id":string,"title":string,"angle":string,"format":"carousel|photo|reel|short|story","score":number,"reason":string}]}`;
const genSystem=`Ты — автономная редакция. Создай полностью готовый контент-пакет по идее. Пиши живо и умно, без канцелярита и дешёвого кликбейта. Публичный материал никогда не содержит внутреннего названия системы. Сделай 5–7 карточек, короткий сильный первый экран, одну мысль на карточку, подпись и адаптации для Instagram/VK/YouTube. Верни JSON {"title":string,"slides":[{"eyebrow":string,"title":string,"body":string}],"caption":string,"platformNotes":{"instagram":string,"vk":string,"youtube":string},"style":"editorial|old-money|documentary|minimal","assetInstruction":string}`;
const reviseSystem=`Ты — старший редактор и маркетолог. Прочитай всю команду пользователя целиком и внеси все смысловые изменения в готовый материал. Не просто комментируй. Сохраняй сильное, исправляй слабое. Проверь публичность, читаемость, хук, удержание, CTA, повторения и фактическую аккуратность. Верни JSON того же формата, что и готовый материал, плюс learnedRules:string[] и changeSummary:string.`;

// Preview only, zero-price gateway model verified against public live catalog
// on 2026-10-26. Never substitute a paid model; never silently run on page load.
const PERSONA_FREE_MODEL = 'nvidia/nemotron-3.5-lightning-free';
const freeAiWindow = new Map<string,{since:number,count:number}>();
function allowFreeAiRequest(request:Request):boolean {
  const key=(request.headers.get('x-forwarded-for')||'unknown').split(',')[0].trim().slice(0,80);
  const now=Date.now(),prev=freeAiWindow.get(key);
  if(prev&&now-prev.since<3600000){
    if(prev.count>=6)return false;
    prev.count+=1;
    return true;
  }
  if(freeAiWindow.size>1000)freeAiWindow.clear();
  freeAiWindow.set(key,{since:now,count:1});
  return true;
}
const freeScriptSystem=`Ты — профессиональный сценарист, режиссёр коротких видео и маркетолог. Пиши ПО-РУССКИ. Верни только валидный JSON без markdown.
Сделай пригодный к съёмке авторский сценарий по конкретной идее пользователя, а не абстрактный текст про творчество.
Если формат reel/short/story — 5–7 ПОСЛЕДОВАТЕЛЬНЫХ КАДРОВ, каждый с конкретным действием, планом (крупный/общий), ракурсом, звуком/репликой и длительностью в секундах. Не выдумывай реальные биографические события. Можно предлагать постановочные эпизоды — обозначь их как сценарную идею.
Если carousel — 5–7 карточек с конкретным примером и законченным повествованием, а не фразами «покажи процесс» и «сделай вывод».
Тон: харизматично, тонкий юмор, кинематографично, без дешёвых мотивационных клише. Эстетика приглушённая old-money, натуральная кожа, никакой ретуши личности.
Формат JSON: {"title":"заголовок","slides":[{"eyebrow":"Кадр 1 · 0–4 сек","title":"короткий заголовок","body":"Конкретно: действие, ракурс, движение камеры, свет, звук/реплика"}],"caption":"готовая подпись без выдуманных фактов","platformNotes":{"instagram":"как адаптировать","vk":"как адаптировать","youtube":"как адаптировать"},"style":"old-money","assetInstruction":"конкретный план съёмки: вертикаль 9:16, свет, фон, одежда, реквизит, монтаж, звук"}
Только JSON, без лишних пояснений.`;
const freeReviseSystem=`Ты — профессиональный сценарист и режиссёр. Выполни ВСЕ требования правки пользователя, не отвечай пояснением вместо изменения текста. Сохрани структуру, но перепиши необходимые кадры/текст/съёмочный план. Не выдумывай историй о пользователе. Верни только JSON той же структуры: title,slides[{eyebrow,title,body}],caption,platformNotes{instagram,vk,youtube},style,assetInstruction,changeSummary. 5–7 последовательных конкретных кадров/карточек.`;
async function freeAiGenerate(system:string,payload:any,request:Request):Promise<any> {
  if(env('PERSONA_ENABLE_FREE_AI')!=='true'||env('VERCEL_ENV')!=='preview')
    throw new Error('free_ai_disabled');
  if(!allowFreeAiRequest(request))throw new Error('free_ai_limit_6_per_hour');
  const token=env('AI_GATEWAY_API_KEY')||request.headers.get('x-vercel-oidc-token')||env('VERCEL_OIDC_TOKEN');
  if(!token)throw new Error('free_ai_gateway_auth_missing');
  const input=JSON.stringify(payload);
  if(input.length>8000)throw new Error('free_ai_input_too_large');
  let response:Response;
  try{
    response=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:PERSONA_FREE_MODEL,
        messages:[{role:'system',content:system},{role:'user',content:input}],
        max_tokens:2400,temperature:0.6,response_format:{type:'json_object'},
      }),
      signal:AbortSignal.timeout(50000),
    });
  }catch{throw new Error('free_ai_network_unavailable')}
  if(!response.ok) {
    if(response.status===403) {
      // Vercel can deny a valid OIDC team without routing to the free model.
      // Only expose documented, allowlisted error TYPES; never echo provider
      // messages, request bodies, headers, keys, or arbitrary details.
      const details:any=await response.json().catch(()=>null);
      const type=details?.error?.type;
      const code=details?.error?.code;
      if(type==='customer_verification_required'||code==='customer_verification_required')
        throw new Error('free_ai_account_verification_required');
      if(type==='access_denied'||code==='access_denied')
        throw new Error('free_ai_gateway_access_denied');
    }
    throw new Error(`free_ai_provider_${response.status}`);
  }
  const data:any=await response.json();
  const content=data.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw new Error('free_ai_empty_response');
  let parsed:any;
  try {parsed=extract(content)} catch {throw new Error('free_ai_json_invalid')}
  if(!parsed||typeof parsed!=='object'||typeof parsed.title!=='string'||
    typeof parsed.caption!=='string'||!Array.isArray(parsed.slides)||
    parsed.slides.length<4||parsed.slides.length>9||
    parsed.slides.some((s:any)=>typeof s.title!=='string'||typeof s.body!=='string')){
    throw new Error('free_ai_structure_invalid');
  }
  return {...parsed,executionMode:'ai',model:PERSONA_FREE_MODEL};
}
async function aiOrFallback(kind:'plan'|'generate'|'revise',payload:any,request:Request,engine?:string){
  if(engine==='free-ai'){
    if(kind==='plan')throw new Error('free_ai_generate_or_revise_only');
    return freeAiGenerate(personaAgentSystemPrompt('creative',kind==='generate'?freeScriptSystem:freeReviseSystem),payload,request);
  }
  // Paid external AI is double opt-in: explicit server permission AND request header.
   // Preview cannot silently spend paid model credits, or conceal a failed
  // model call behind a pretend AI-generated quality result.
  if(env('PERSONA_ENABLE_EXTERNAL_AI')==='true' && env('PERSONA_ALLOW_PAID_REQUESTS')==='true' && request.headers.get('x-persona-paid-approved')==='true' && env('PERSONA_ENABLE_FREE_AI')!=='true'){
    try{
      const generated=kind==='plan'?await openAI(personaAgentSystemPrompt('marketing',planSystem),payload):kind==='generate'?await openAI(personaAgentSystemPrompt('creative',genSystem),payload):await openAI(personaAgentSystemPrompt('creative',reviseSystem),payload);
      return {...generated,executionMode:'ai'};
    }catch(e){console.error('persona_ai_fallback',String((e as Error)?.message||e))}
  }
  if(kind==='plan')return {ideas:localIdeas(payload?.history||[]),executionMode:'template'};
  if(kind==='generate')return {...localDraft(payload.idea,payload.assetName),executionMode:'template'};
  return {...localRevise(payload.draft,String(payload.feedback||'')),executionMode:'template'};
}
async function transcribe(request:Request){
  if(env('PERSONA_ENABLE_EXTERNAL_AI')!=='true'||env('PERSONA_ALLOW_PAID_REQUESTS')!=='true'||request.headers.get('x-persona-paid-approved')!=='true'){
    return json({error:'В тестовом режиме голосовое распознавание ещё не подключено. Используй текстовую правку.'},503);
  }
  const form=await request.formData();
  const audio=form.get('audio');
  if(!(audio instanceof File)||!audio.size)return json({error:'audio_required'},400);
  const key=env('OPENAI_API_KEY')||env('openai_api_key');
  if(!key)return json({error:'voice_provider_not_configured'},503);
  try{
    const outbound=new FormData();
    outbound.append('file',audio,audio.name||'voice.webm');
    outbound.append('model',env('PERSONA_TRANSCRIBE_MODEL')||'gpt-4o-transcribe');
    outbound.append('language','ru');
    const response=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',headers:{Authorization:`Bearer ${key}`},body:outbound
    });
    if(response.ok){
      const data:any=await response.json();
      if(String(data.text||'').trim())return json({transcript:String(data.text).trim()});
    }
  }catch(e){console.error('persona_transcription',String((e as Error)?.message||e))}
  return json({error:'voice_unavailable'},503);
}
export default{async fetch(request:Request){
  // Safe read-only preview health check. Report only availability, never tokens.
  if(request.method==='GET' && new URL(request.url).searchParams.get('auth_health')==='1' &&
      env('VERCEL_ENV')==='preview' && env('PERSONA_ENABLE_FREE_AI')==='true'){
    return json({freeAiPreview:true,
      authReady:Boolean(env('AI_GATEWAY_API_KEY')||request.headers.get('x-vercel-oidc-token')||env('VERCEL_OIDC_TOKEN')),
      tokenIncluded:false});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405,{Allow:'POST'});const contentType=request.headers.get('content-type')||'';if(contentType.includes('multipart/form-data'))return transcribe(request);try{const body:any=await request.json();const action=String(body?.action||'plan');if(action==='plan'){const result:any=await aiOrFallback('plan',{history:body.history||[],seed:body.seed||[]},request,body.engine);const ideas=Array.isArray(result?.ideas)?result.ideas:localIdeas(body.history||[]);return json({ideas:ideas.slice(0,24).map((x:any,i:number)=>({...x,id:String(x.id||`idea-${i+1}`),score:Number(x.score||80),status:'candidate'})),mode:result.executionMode||'template'})}if(action==='generate'){const result:any=await aiOrFallback('generate',{idea:body.idea,history:body.history||[],assetName:body.assetName||''},request,body.engine);const draft:Draft=result.draft?result.draft:result;const safe={...draft,title:clean(draft.title),caption:clean(draft.caption),slides:(draft.slides||[]).map((s:any)=>({eyebrow:clean(s.eyebrow),title:clean(s.title),body:clean(s.body)}))};const qa=localQA(safe);if(!qa.pass&&result.executionMode!=='ai'){const repaired=localRevise(safe,'Сделай материал читабельным, убери повторы и внутреннее название системы.');Object.assign(safe,repaired.draft)}return json({draft:safe,qa:localQA(safe),summary:result.changeSummary||'Текстовый черновик создан; проведена формальная проверка структуры.',mode:result.executionMode||'template',model:result.model||null})}if(action==='revise'){const result:any=await aiOrFallback('revise',{draft:body.draft,feedback:body.feedback,history:body.history||[]},request,body.engine);const draft:Draft=result.draft?result.draft:result;const safe={...draft,title:clean(draft.title),caption:clean(draft.caption),slides:(draft.slides||[]).map((s:any)=>({eyebrow:clean(s.eyebrow),title:clean(s.title),body:clean(s.body)}))};const qa=localQA(safe);if(!qa.pass&&result.executionMode!=='ai'){const repaired=localRevise(safe,'Сделай материал читабельным, убери повторы и внутреннее название системы.');Object.assign(safe,repaired.draft)}return json({draft:safe,qa:localQA(safe),learnedRules:result.learnedRules||[],summary:result.changeSummary||'Текстовый черновик обновлён.',mode:result.executionMode||'template',model:result.model||null})}return json({error:'unknown_action'},400)}catch(e){const code=String((e as Error)?.message||'pipeline_unavailable');console.error('persona_route_error_code',code.startsWith('free_ai_')?code:'pipeline_unavailable');return json({error:code.startsWith('free_ai_')?code:'pipeline_unavailable'},code==='free_ai_limit_6_per_hour'?429:503)}}};
