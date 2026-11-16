import presets from './persona-lighting-presets.json' with {type:'json'};
/** Deterministic pre-production advice from one shared contract, not footage analysis. */
export function personaLightingPlan(description){
 if(typeof description!=='string'||!description.trim()||description.length>5000)
  throw Error('Scene description must be 1–5000 characters');
 const source=description.trim();
 const normalized=source.toLocaleLowerCase('ru-RU');
 const preset=presets.presets.find(item=>item.keywords.length&&item.keywords.some(word=>normalized.includes(word)))??presets.presets.at(-1);
 return {version:presets.version,style:presets.style,scene:source,preset:preset.id,
  title:preset.title,key:preset.key,fill:preset.fill,back:preset.back,
  background:preset.background,note:preset.note,
  ...(preset.rule?{rule:preset.rule}:{}),
  evidence:'Рекомендация по описанию, не анализ реального видео или помещения.',
  source:'rules-v1'};
}
