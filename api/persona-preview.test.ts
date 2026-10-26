import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './persona';

afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs()});
function request(body:unknown){return new Request('http://localhost/api/persona',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}

describe('Persona accessible, no-paid-API trial',()=>{
  it('returns a usable script draft clearly labeled template mode with no network calls',async()=>{
    vi.stubEnv('PERSONA_ENABLE_EXTERNAL_AI','false');
    const network=vi.fn();vi.stubGlobal('fetch',network);
    const response=await handler.fetch(request({action:'generate',idea:{id:'one',title:'Первая проба в кадре',angle:'Как меняется сцена',format:'reel',score:0}}));
    expect(response.status).toBe(200);
    const data=await response.json();
    expect(data.mode).toBe('template');
    expect(data.draft.title).toContain('Первая проба');
    expect(data.draft.slides.length).toBeGreaterThanOrEqual(5);
    expect(network).not.toHaveBeenCalled();
  });
  it('returns idea bank with declared mode and does not call paid models',async()=>{
    vi.stubEnv('PERSONA_ENABLE_EXTERNAL_AI','false');
    const network=vi.fn();vi.stubGlobal('fetch',network);
    const response=await handler.fetch(request({action:'plan',history:[]}));
    expect(response.status).toBe(200);
    const data=await response.json();
    expect(data.mode).toBe('template');
    expect(data.ideas.length).toBeGreaterThanOrEqual(10);
    expect(network).not.toHaveBeenCalled();
  });
});

describe('Real free model only on explicit opt-in',()=>{
  it('does not call gateway if preview toggle not configured',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','false');
    vi.stubEnv('VERCEL_ENV','preview');
    const network=vi.fn();vi.stubGlobal('fetch',network);
    const res=await handler.fetch(request({action:'generate',engine:'free-ai',idea:{title:'Кулисы',angle:'Актёр',format:'reel'}}));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('free_ai_disabled');
    expect(network).not.toHaveBeenCalled();
  });
  it('calls ONLY pinned zero-price AI Gateway model and returns actual AI mode',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','true');
    vi.stubEnv('VERCEL_ENV','preview');
    vi.stubEnv('VERCEL_OIDC_TOKEN','test-oidc-not-real');
    const fake=JSON.stringify({title:'Репетиция',caption:'Подпись',style:'old-money',
      slides:Array.from({length:5},(_,i)=>({eyebrow:'Кадр '+i,title:'Сцена '+i,body:'Действие, свет и реплика '+i})),
      platformNotes:{instagram:'9:16',vk:'short',youtube:'short'},assetInstruction:'Свет сбоку, камера 35мм'});
    const network=vi.fn(async(url:string,init:any)=>{
      expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
      const sent=JSON.parse(init.body);
      expect(sent.model).toBe('nvidia/nemotron-3.5-lightning-free');
      expect(sent.messages[1].content).toContain('Кулисы');
      expect(sent.models).toBeUndefined();
      return new Response(JSON.stringify({choices:[{message:{content:fake}}]}),{status:200});
    });
    vi.stubGlobal('fetch',network);
    const res=await handler.fetch(request({action:'generate',engine:'free-ai',idea:{title:'Кулисы',angle:'Актёр',format:'reel'}}));
    expect(res.status).toBe(200);
    const out=await res.json();
    expect(out.mode).toBe('ai');
    expect(out.model).toBe('nvidia/nemotron-3.5-lightning-free');
    expect(out.draft.slides).toHaveLength(5);
    expect(network).toHaveBeenCalledTimes(1);
  });
  it('never silently replaces a failed real model with a template',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','true');
    vi.stubEnv('VERCEL_ENV','preview');
    vi.stubEnv('VERCEL_OIDC_TOKEN','test-oidc-not-real');
    const network=vi.fn(async()=>new Response('{}',{status:503}));
    vi.stubGlobal('fetch',network);
    const res=await handler.fetch(request({action:'generate',engine:'free-ai',idea:{title:'Кулисы',angle:'Актёр',format:'reel'}}));
    expect(res.status).toBe(503);
    const out=await res.json();
    expect(out.error).toBe('free_ai_provider_503');
  });
});
