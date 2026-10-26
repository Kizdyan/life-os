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
  it('classifies account-level 403 access_denied without exposing provider message',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','true');
    vi.stubEnv('VERCEL_ENV','preview');
    vi.stubEnv('VERCEL_OIDC_TOKEN','test-oidc-not-real');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({
      error:{type:'access_denied',message:'secret-untrusted-provider-error-text'}
    }),{status:403,headers:{'Content-Type':'application/json'}})));
    const res=await handler.fetch(request({action:'generate',engine:'free-ai',
      idea:{title:'Сценарий',format:'reel'}}));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({error:'free_ai_gateway_access_denied'});
  });
  it('distinguishes verification-required 403 from general access denied',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','true');
    vi.stubEnv('VERCEL_ENV','preview');
    vi.stubEnv('VERCEL_OIDC_TOKEN','test-oidc-not-real');
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({
      error:{code:'customer_verification_required'}
    }),{status:403,headers:{'Content-Type':'application/json'}})));
    const res=await handler.fetch(request({action:'generate',engine:'free-ai',
      idea:{title:'Сценарий',format:'reel'}}));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({error:'free_ai_account_verification_required'});
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

  it('uses the Vercel-injected function OIDC request header when env token is absent',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','true');
    vi.stubEnv('VERCEL_ENV','preview');
    vi.stubEnv('AI_GATEWAY_API_KEY','');
    vi.stubEnv('VERCEL_OIDC_TOKEN','');
    const draft=JSON.stringify({title:'За кулисами',caption:'Подпись',style:'old-money',
      slides:Array.from({length:5},(_,i)=>({eyebrow:'Кадр '+i,title:'Сцена '+i,body:'Действие, свет и реплика '+i})),
      platformNotes:{instagram:'9:16',vk:'short',youtube:'short'},assetInstruction:'Свет сбоку, вертикальная камера'});
    const gateway=vi.fn(async (_url:string,init:any)=>{
      expect(init.headers.Authorization).toBe('Bearer injected-vercel-oidc-test');
      return new Response(JSON.stringify({choices:[{message:{content:draft}}]}),{status:200});
    });
    vi.stubGlobal('fetch',gateway);
    const input=new Request('http://localhost/api/persona',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-vercel-oidc-token':'injected-vercel-oidc-test'},
      body:JSON.stringify({action:'generate',engine:'free-ai',idea:{title:'За кулисами',format:'reel'}}),
    });
    const response=await handler.fetch(input);
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe('ai');
    expect(gateway).toHaveBeenCalledTimes(1);
  });

});

describe('Preview OIDC availability diagnostic',()=>{
  it('never returns the token itself, only availability',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','true');
    vi.stubEnv('VERCEL_ENV','preview');
    vi.stubEnv('AI_GATEWAY_API_KEY','');
    vi.stubEnv('VERCEL_OIDC_TOKEN','');
    const req=new Request('http://localhost/api/persona?auth_health=1',{
      headers:{'x-vercel-oidc-token':'fake-JWT-that-must-not-escape'}});
    const res=await handler.fetch(req);
    expect(res.status).toBe(200);
    const json=await res.json();
    expect(json).toEqual({freeAiPreview:true,authReady:true,tokenIncluded:false});
    expect(JSON.stringify(json)).not.toContain('fake-JWT');
  });
  it('does not expose status outside enabled preview',async()=>{
    vi.stubEnv('PERSONA_ENABLE_FREE_AI','false');
    vi.stubEnv('VERCEL_ENV','production');
    const res=await handler.fetch(new Request('http://localhost/api/persona?auth_health=1'));
    expect(res.status).toBe(405);
  });
});
