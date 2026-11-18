/**
 * Honest, local Ollama-only script draft. An actual successful Ollama reply is
 * required before the UI can display "Сценарий реального ИИ".
 * Model inference never fabricates recorded footage, facts or approvals.
 */
const fail=message=>{throw Error('persona_script_draft_'+message)};
const bounded=(value,max)=>typeof value==='string'&&value.trim()&&value.length<=max;
function verifyDraft(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!bounded(raw.title,160)||
  !bounded(raw.caption,4500)||!Array.isArray(raw.slides)||
  raw.slides.length<5||raw.slides.length>7)fail('invalid_model_output');
 const slides=raw.slides.map(s=>{
  if(!s||!bounded(s.eyebrow,70)||!bounded(s.title,160)||!bounded(s.body,190))
   fail('invalid_model_slide');
  return {eyebrow:s.eyebrow.trim(),title:s.title.trim(),body:s.body.trim()};
 });
 if(new Set(slides.map(s=>s.title.toLowerCase())).size!==slides.length)
  fail('duplicate_model_slides');
 if(/\bpersona\b|персона/iu.test([raw.title,raw.caption,...slides.flatMap(s=>[s.eyebrow,s.title,s.body])].join(' ')))
  fail('internal_brand_in_public_copy');
 const platformNotes=raw.platformNotes;
 if(!platformNotes||!['instagram','vk','youtube'].every(k=>bounded(platformNotes[k],400)))
  fail('invalid_platform_notes');
 return {title:raw.title.trim(),caption:raw.caption.trim(),slides,
  platformNotes:{instagram:platformNotes.instagram,vk:platformNotes.vk,youtube:platformNotes.youtube},
  style:['editorial','old-money','documentary','minimal'].includes(raw.style)?raw.style:'editorial',
  assetInstruction:typeof raw.assetInstruction==='string'?raw.assetInstruction.slice(0,500):''};
}
export async function generateLocalPersonaScriptDraft({idea,history=[],model='qwen3:4b-instruct',fetchImpl=fetch}={}){
 if(!idea||typeof idea!=='object'||!bounded(idea.title,140)||!bounded(idea.angle,1600)||
  !['reel','carousel','photo','short','story'].includes(idea.format)||
  !/^[A-Za-z0-9][A-Za-z0-9:._-]{0,119}$/.test(model))
  fail('invalid_request');
 const system=[
  'Ты профессиональный режиссёр, сценарист и редактор для актёра и композитора.',
  'Составь оригинальный короткий контент-пакет на русском языке в JSON.',
  'Для Reels: 5-7 монтажных смысловых шагов; одна конкретная актёрская задача в каждом.',
  'Для карусели: 5-7 коротких смысловых слайдов; полный основной текст в отдельном caption.',
  'Не выдавай за документальные факты вымышленные роли, награды, события и съёмки.',
  'Никаких клише успеха, мотивационных банальностей, общего текста или названия Persona.',
  'Хук, конфликт, развитие и поворот, практически исполнимые одному человеку.',
  'Внутренняя структура — черновик, не монтаж, не актёрская или публикационная проверка.',
  'Верни строго объект JSON: {"title":string,"caption":string,',
  '"slides":[{"eyebrow":string,"title":string,"body":string}] (5-7 элементов),',
  '"platformNotes":{"instagram":string,"vk":string,"youtube":string},',
  '"style":"editorial|old-money|documentary|minimal","assetInstruction":string}.',
  'Каждый title<=160 символов, body<=190, caption<=4500. Не упоминай внутренний бренд.',
 ].join('\n');
 const payload=JSON.stringify({topic:idea.title,angle:idea.angle,format:idea.format,
  recentlyUsedTitles:Array.isArray(history)?history.slice(-12).filter(x=>typeof x==='string').map(x=>x.slice(0,180)):[]});
 let response;
 try{response=await fetchImpl('http://127.0.0.1:11434/api/chat',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({model,stream:false,format:'json',
   messages:[{role:'system',content:system},{role:'user',content:payload}],
   options:{temperature:.65,num_predict:2800}}),
  signal:AbortSignal.timeout(90000)
 })}catch{fail('ollama_unavailable')}
 if(!response?.ok)fail('ollama_http_'+response?.status);
 let result;
 try{const data=await response.json();result=JSON.parse(data.message.content)}
 catch{fail('ollama_invalid_json')}
 return {draft:verifyDraft(result),mode:'ai',provider:'ollama-local',model,
  summary:'Ответ получен от реальной локальной модели; требуется авторское утверждение.'};
}
