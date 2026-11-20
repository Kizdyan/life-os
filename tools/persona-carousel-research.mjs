/** Paid, explicit, web-grounded carousel research from the existing localhost Persona Worker.
 * No API key, author approvals or media leave this module. The returned packet is
 * only a draft: web-search provenance does not independently verify each claim.
 */
const API_URL='https://api.perplexity.ai/v1/agent';
const MODEL_DEFAULT='openai/gpt-5.6-sol';
const researchPrompt=`Ты — исследователь и независимый редактор. Найди одну проверяемую, неожиданную реальную историю из кино, актёрства, режиссуры или киномузыки. Это личный профиль актёра-композитора, а НЕ энциклопедический паблик. Сначала ищи в сети отраслевые первоисточники и интервью. Верни ТОЛЬКО валидный JSON без Markdown:
{"title":"...","angle":"...","caption":"...","slides":[
{"text":"...","visualDirection":"...","sources":[{"title":"...","url":"https://..."}]},
{"text":"...","visualDirection":"...","sources":[{"title":"...","url":"https://..."}]},
{"text":"...","visualDirection":"...","sources":[{"title":"...","url":"https://..."}]},
{"text":"...","visualDirection":"...","sources":[{"title":"...","url":"https://..."}]},
{"text":"...","visualDirection":"...","interpretation":true}
]}
Требования: 5–7 смысловых слайдов, текст на каждом не больше 260 символов, 5–160 символов в названии. Ранние слайды интригуют, каждый добавляет проверяемую деталь, финал переосмысляет историю без выдуманных фактов. Каждая ссылка должна быть ТОЧНЫМ URL, реально найденным через веб-поиск инструмента. Не выдумывай URL, цитаты, факты и даты; при недостатке источников прямо сообщи об отсутствии доказательств вместо генерации JSON. VisualDirection — кинематографичный кадр, без чужих лиц и без букв внутри изображения. Никаких нумераций и служебного текста на слайдах.`;
function validUrl(raw){
 try{const u=new URL(raw);return u.protocol==='https:'&&Boolean(u.hostname)&&!u.username&&!u.password&&!/^(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(u.hostname)}
 catch{return false}
}
function normalizeUrl(raw){
 const u=new URL(raw);u.hash='';u.searchParams.delete('utm_source');u.searchParams.delete('utm_medium');
 u.searchParams.delete('utm_campaign');return u.toString().replace(/\/$/,'');
}
function outputText(data){
 return (Array.isArray(data?.output)?data.output:[]).filter(x=>x?.type==='message')
  .flatMap(x=>Array.isArray(x.content)?x.content:[])
  .filter(x=>x?.type==='output_text'&&typeof x.text==='string')
  .map(x=>x.text).join('\n');
}
function searchUrls(data){
 const found=new Set();
 for(const entry of Array.isArray(data?.output)?data.output:[]){
  if(!Array.isArray(entry?.results))continue;
  for(const result of entry.results){
   if(typeof result?.url==='string'&&validUrl(result.url))found.add(normalizeUrl(result.url));
  }
 }
 return found;
}
function string(s,max,label){if(typeof s!=='string'||!s.trim()||s.length>max)throw Error('Неполный текст: '+label);return s.trim()}
function parsePacket(raw,urls){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Array.isArray(raw.slides)||
    raw.slides.length<5||raw.slides.length>7)throw Error('Исследование не содержит 5–7 слайдов');
 const packet={title:string(raw.title,160,'название'),angle:string(raw.angle,500,'задача'),
  caption:string(raw.caption,4500,'подпись'),slides:[]};
 for(const [i,item] of raw.slides.entries()){
  const idx=i+1;text(item);
  function text(s){if(!s||typeof s!=='object'||Array.isArray(s))throw Error('Некорректный слайд '+idx)}
  const slide={text:string(item.text,260,'слайд '+idx),visualDirection:
   typeof item.visualDirection==='string'?item.visualDirection.slice(0,350):'',
   interpretation:item.interpretation===true,sources:[]};
  const declaredSources=item.sources??[];
  if(!Array.isArray(declaredSources)||declaredSources.length>4)throw Error('Слайд '+idx+': некорректные ссылки');
  for(const x of declaredSources){
   if(!x||typeof x!=='object'||!validUrl(x.url)||!urls.has(normalizeUrl(x.url)))
    throw Error('Слайд '+idx+': источник не найден в реальных результатах поиска');
   slide.sources.push({title:string(x.title,160,'источник'),url:x.url});
  }
  if(!slide.sources.length&&!slide.interpretation)
   throw Error('Слайд '+idx+': нет найденного источника или пометки об авторской трактовке');
  if(slide.interpretation&&slide.sources.length)throw Error('Слайд '+idx+': авторская интерпретация не должна маскировать неподтверждённый факт');
  packet.slides.push(slide);
 }
 return packet;
}
export async function generatePersonaCarouselResearch({theme,consent,env=process.env,fetchImpl=fetch}={}){
 if(consent!==true)throw Error('Нужно явное согласие на платный запрос Perplexity');
 if(typeof theme!=='string'||theme.trim().length<6||theme.length>250)throw Error('Укажи тему от 6 до 250 символов');
 const key=env.PERPLEXITY_API_KEY?.trim();
 if(!key)throw Error('PERPLEXITY_API_KEY не настроен в локальном Worker');
 const model=env.PERSONA_CAROUSEL_RESEARCH_MODEL||MODEL_DEFAULT;
 if(!/^[A-Za-z0-9._/-]{3,90}$/.test(model))throw Error('Неверное имя модели');
 const body={model,input:'Тема пользователя: '+theme.trim(),instructions:researchPrompt,
  tools:[{type:'web_search'}],max_tool_calls:5,max_output_tokens:4200,store:false};
 let response;
 try{response=await fetchImpl(API_URL,{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
  body:JSON.stringify(body),signal:AbortSignal.timeout(110000)})}
 catch{throw Error('Perplexity недоступен. Не создаём фиктивные источники.')}
 if(!response.ok)throw Error('Perplexity HTTP '+response.status+'. Проверь ключ и лимит запросов.');
 let data,raw;
 try{data=await response.json();const text=outputText(data);
   if(data.status!=='completed'||!text||text.length>33000)throw Error('incomplete');
   raw=JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,''));
 }catch{throw Error('Perplexity не вернул завершённый структурированный результат. Ничего не импортировано.')}
 const urls=searchUrls(data);
 if(!urls.size)throw Error('В ответе нет поисковых результатов. Исследование заблокировано.');
 const packet=parsePacket(raw,urls);
 return {provider:'perplexity',status:'UNVERIFIED',model:data.model||model,
  sourceEvidence:'web_search_results',packet,
  notice:'URL присутствовали в результатах поиска Perplexity. Содержимое статей и факты должны быть проверены человеком.',
  published:false,approved:false};
}
