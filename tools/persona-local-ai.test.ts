import {describe,it,expect,vi} from 'vitest';
import {localOrigin,safeModel,listModels,inspectScript,runLocal} from './persona-local-ai.mjs';
const model='qwen2.5-coder:7b';
const mock=(data:any,status=200)=>new Response(JSON.stringify(data),{status});
const draft=()=>({
 title:'Актёр за кулисами',hook:'Актёр слышит чужие аплодисменты и замирает',twist:'Оказывается, шумит будильник на телефоне',runtimeSec:35,
 shootingOrder:'Снимаем подряд четыре сцены в одном помещении на iPhone.',
 productionNotes:'Ставим телефон на полку, свет направляем сбоку из окна.',
 platforms:{instagram:'Вертикальное видео 9:16',vk:'Короткая вертикальная версия',youtube:'Shorts с быстрым началом'},
 scenes:[
  {startSec:0,endSec:8,action:'Актёр резко смотрит на дверь сцены',dialogue:'Почему все уже аплодируют?',camera:'Крупный план у двери в коридоре',lighting:'Боковой свет из окна',sound:'Далёкие аплодисменты слышны',edit:'Склейка на удивление героя'},
  {startSec:8,endSec:16,action:'Актёр открывает дверь и видит пустой зал',dialogue:'Вот это мой аншлаг!',camera:'Средний план с фиксированного штатива',lighting:'Свет через проход в зрительный зал',sound:'Тихая реверберация пустого зала',edit:'Склейка по движению дверной ручки'},
  {startSec:16,endSec:24,action:'Актёр делает поклон перед пустыми креслами',dialogue:'Спасибо, я вас тоже люблю!',camera:'Общий план из середины зрительного зала',lighting:'Свет одиночного прожектора',sound:'Нарастающий звон мобильного телефона',edit:'Быстрый резкий крупный план телефона'},
  {startSec:24,endSec:35,action:'Актёр просыпается на диване и выключает телефон',dialogue:'Даже во сне нет выходных',camera:'Средний план неподвижного iPhone',lighting:'Мягкий утренний свет из окна',sound:'Звенящий будильник на телефоне',edit:'Склейка в чёрный кадр после реплики'},
 ]});
describe('Persona local Qwen direct execution',()=>{
 it('forbids remote inference servers and cloud models',()=>{
  expect(localOrigin('http://localhost:11434')).toBe('http://localhost:11434');
  expect(()=>localOrigin('https://ollama.com')).toThrow();
  expect(()=>localOrigin('http://10.0.0.5:11434')).toThrow();
  expect(()=>safeModel('qwen3:cloud')).toThrow();
 });
 it('discovers installed model only with GET and no generation',async()=>{
  const fetcher=vi.fn(async()=>mock({models:[{name:model}]}));
  expect(await listModels(undefined,fetcher)).toEqual([model]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toContain('/api/tags');
 });
 it('runs an explicitly chosen installed model and retains source evidence',async()=>{
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/api/tags')
   ?mock({models:[{name:model}]})
   :mock({message:{content:JSON.stringify(draft())},prompt_eval_count:250,eval_count:900}));
  const result=await runLocal({model,transport:fetcher});
  expect(result.status).toBe('STRUCTURE_PASS');
  expect(result.source).toBe('real-local-ollama-completion');
  expect(result.qa.pass).toBe(true);
  expect(result.usage.completionTokens).toBe(900);
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it('rejects hallucinated model names before sending a prompt',async()=>{
  const fetcher=vi.fn(async()=>mock({models:[{name:'another:1b'}]}));
  await expect(runLocal({model,transport:fetcher})).rejects.toThrow('not installed');
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('detects scene timing gaps, missing camera and fake structure',()=>{
  const bad=draft();bad.scenes[1].startSec=3;bad.scenes[0].camera='';
  expect(inspectScript(bad).pass).toBe(false);
  expect(inspectScript({}).pass).toBe(false);
 });
 it('never silently substitutes template on provider errors',async()=>{
  const fetcher=vi.fn(async(url:string)=>url.endsWith('/api/tags')
    ?mock({models:[{name:model}]})
    :mock({error:'unavailable'},503));
  await expect(runLocal({model,transport:fetcher})).rejects.toThrow('HTTP 503');
 });
});
