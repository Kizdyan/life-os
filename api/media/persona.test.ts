import{describe,expect,it}from'vitest';
import handler from'./persona.js';

const baseDraft={title:'Тест',slides:[{eyebrow:'СЦЕНА',title:'Один момент',body:'Короткий текст.'}],caption:'Подпись',platformNotes:{instagram:'IG',vk:'VK',youtube:'YT'}};

describe('persona v3 API guards',()=>{
 it('reports pipeline version and status on GET',async()=>{const response=await handler.fetch(new Request('https://life-os.test/api/persona'));expect(response.status).toBe(200);const body:any=await response.json();expect(body.pipelineVersion).toBe(3);expect(typeof body.personaAI).toBe('boolean')});
 it('rejects unknown actions before any AI call',async()=>{const response=await handler.fetch(new Request('https://life-os.test/api/persona',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'not-real'})}));expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'unknown_action'})});
 it('requires a real idea for generation',async()=>{const response=await handler.fetch(new Request('https://life-os.test/api/persona',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'generate'})}));expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'idea_required'})});
 it('requires both draft and semantic feedback for revision',async()=>{const response=await handler.fetch(new Request('https://life-os.test/api/persona',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'revise',feedback:'сделай лучше'})}));expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'draft_and_feedback_required'})});
 it('requires a valid draft for prepublish QA',async()=>{const response=await handler.fetch(new Request('https://life-os.test/api/persona',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'prepublish'})}));expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'draft_required'})});
 it('rejects prepublish drafts with incomplete platform adaptation before any AI call',async()=>{const draft={...baseDraft,platformNotes:{instagram:'IG'}};const response=await handler.fetch(new Request('https://life-os.test/api/persona',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'prepublish',draft})}));expect(response.status).toBe(400);expect(await response.json()).toEqual({error:'draft_required'})});
});
