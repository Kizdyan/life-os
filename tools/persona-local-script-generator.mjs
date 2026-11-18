/** Real locally executed Ollama scenario draft, never a template disguised as AI. */
const fail=message=>{throw Error('Persona local script: '+message)};
const MODEL=/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/;
function nonempty(value,max){
 return typeof value==='string'&&value.trim().length>0&&value.length<=max;
}
export function validateLocalScenarioDraft(value){
 if(!value||typeof value!=='object'||!nonempty(value.title,160)||
  !nonempty(value.caption,4500)||!Array.isArray(value.slides)||
  value.slides.length<4||value.slides.length>9||
  value.slides.some(s=>!s||!nonempty(s.title,160)||!nonempty(s.body,700)||
   typeof s.eyebrow!=='string'||s.eyebrow.length>100)||
  !value.platformNotes||!['instagram','vk','youtube'].every(k=>
   typeof value.platformNotes[k]==='string'&&value.platformNotes[k].length<=1200)||
  !['editorial','old-money','documentary','minimal'].includes(value.style)||
  typeof value.assetInstruction!=='string'||value.assetInstruction.length>2000)
  fail('invalid_model_output');
 return {
  title:value.title.trim(),caption:value.caption.trim(),
  slides:value.slides.map(s=>({eyebrow:s.eyebrow.trim(),title:s.title.trim(),body:s.body.trim()})),
  platformNotes:{instagram:value.platformNotes.instagram,vk:value.platformNotes.vk,
   youtube:value.platformNotes.youtube},
  style:value.style,assetInstruction:value.assetInstruction
 };
}
export async function generatePersonaLocalScript({idea,history=[],assetName='',model,fetchImpl=fetch}={}){
 if(!idea||!nonempty(idea.title,180)||!nonempty(idea.angle,650)||
  !['reel','short','story','carousel','photo'].includes(idea.format)||
  !MODEL.test(model??'')||!Array.isArray(history)||history.length>30||
  history.some(h=>typeof h!=='string'||h.length>300)||
  typeof assetName!=='string'||assetName.length>250)
  fail('invalid_request');
 const system=[
 'Ты — профессиональный сценарист и строгий редактор русского контента актёра, композитора и режиссёра.',
 'Создай оригинальный конкретный сценарий по теме. Не выдумывай личный опыт, результаты, статистику, съёмки или факты.',
 'Избегай клише, мотивационного пафоса и бытовых банальностей.',
 'Для Reels — конфликт, действие, поворот, реплики и план кадров; для карусели — короткие тезисы и длинная подпись.',
 'Верни один JSON: title, slides (5–7 объектов eyebrow,title,body), caption,',
 'platformNotes (instagram,vk,youtube), style (editorial|old-money|documentary|minimal), assetInstruction.',
 'Не пиши внутренний бренд Persona в публичных текстах. Не заявляй, что файл опубликован.'
 ].join(' ');
 let response;
 try{
  response=await fetchImpl('http://127.0.0.1:11434/api/chat',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({model,stream:false,format:'json',
    options:{temperature:0.7,num_predict:2400},messages:[
     {role:'system',content:system},{role:'user',content:JSON.stringify({idea,history,assetName})}
    ]}),signal:AbortSignal.timeout(120000)
  });
 }catch{fail('ollama_unavailable')}
 if(!response?.ok)fail('ollama_http_'+response?.status);
 let data;
 try{data=await response.json()}catch{fail('ollama_invalid_response')}
 let parsed;
 try{
  const text=data?.message?.content;
  if(typeof text!=='string'||text.length>18000)throw Error('invalid');
  parsed=JSON.parse(text.trim().replace(/^```(?:json)?\s*/i,'').replace(/```$/,'').trim());
 }catch{fail('ollama_invalid_json')}
 const draft=validateLocalScenarioDraft(parsed);
 return {mode:'ai',provider:'ollama-local',model,draft,
  publicationApproved:false,renderedVideo:false};
}
