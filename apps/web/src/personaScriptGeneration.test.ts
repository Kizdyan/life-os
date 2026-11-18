import {describe,it,expect,vi} from 'vitest';
import {generatePersonaDraftWithRealAi,validateAiDraft} from './personaScriptGeneration';
const idea={id:'reel-01',title:'Актёр и композитор',angle:'Конфликт на репетиции',format:'reel'};
const draft={
 title:'Репетиция наоборот',caption:'Конкретная история с поворотом.',
 slides:Array.from({length:5},(_,i)=>({eyebrow:'Эпизод '+i,title:'Сцена '+i,body:'Настоящее действие на сцене '+i})),
 platformNotes:{instagram:'Reels',vk:'Клип',youtube:'Short'},
 style:'documentary',assetInstruction:'Снять пять кадров'
};
const response=(obj:unknown,ok=true)=>({ok,json:async()=>obj}) as Response;
describe('default scenario model provenance',()=>{
 it('uses a real authenticated local Ollama response, never calls cloud or template',async()=>{
  const fetchImpl=vi.fn(async (_u:string)=>response(
   _u.includes('/health')?{service:'persona-media-worker',components:{ollama:true},token:'token'}:
    {mode:'ai',provider:'ollama-local',model:'qwen3:4b-instruct',draft}
  )) as unknown as typeof fetch;
  const result=await generatePersonaDraftWithRealAi({idea,history:[],fetchImpl,workerBase:'http://127.0.0.1:47832'});
  expect(result).toMatchObject({model:'qwen3:4b-instruct',provider:'ollama-local'});
  expect(fetchImpl).toHaveBeenCalledTimes(2);
  expect(fetchImpl).not.toHaveBeenCalledWith('/api/persona',expect.anything());
 });
 it('when Worker is offline only a REAL configured OpenRouter reply counts as AI',async()=>{
  const fetchImpl=vi.fn(async (url:string)=>url.includes('/health')?Promise.reject(Error('offline')):
   response({mode:'ai',model:'test/model',draft})) as unknown as typeof fetch;
  expect(await generatePersonaDraftWithRealAi({idea,history:[],fetchImpl}))
   .toMatchObject({provider:'openrouter',model:'test/model'});
 });
 it('never marks a template, missing provider or injected internal branding as AI',async()=>{
  const fetchImpl=vi.fn(async (url:string)=>url.includes('/health')?
   Promise.reject(Error('offline')):response({mode:'template',draft})) as unknown as typeof fetch;
  expect(await generatePersonaDraftWithRealAi({idea,history:[],fetchImpl})).toBeNull();
  expect(()=>validateAiDraft({...draft,caption:'Публикация Persona'})).toThrow();
  expect(()=>validateAiDraft({...draft,slides:draft.slides.slice(0,3)})).toThrow();
 });
});
