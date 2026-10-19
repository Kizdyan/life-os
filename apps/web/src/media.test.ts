import { describe, expect, it } from 'vitest';
import { beginYandexConnect, mediaApiBase, mediaStatusBase, readMediaStatus } from './media';

describe('web Media Brain API boundary',()=>{
  it('treats missing server base as not configured instead of leaking browser secrets',async()=>{
    const status=await readMediaStatus({baseUrl:'',fetchImpl:async()=>{throw new Error('must not fetch')}});
    expect(status).toMatchObject({state:'not_configured',connected:false,provider:'yandex'});
  });

  it('treats a missing status endpoint as an unavailable server boundary',async()=>{
    const status=await readMediaStatus({baseUrl:'/api',fetchImpl:async()=>new Response('',{status:404})});
    expect(status).toMatchObject({state:'not_configured',connected:false,configured:false,error:null});
  });

  it('normalizes an explicit server base without adding credentials',()=>{
    expect(mediaApiBase('https://life.example.com/api/')).toBe('https://life.example.com/api');
    expect(mediaApiBase('  /api  ')).toBe('/api');
  });

  it('does not probe an absent Media Brain API from a standalone local preview',()=>{
    expect(mediaStatusBase(undefined,'','127.0.0.1')).toBe('');
    expect(mediaStatusBase(undefined,'','localhost')).toBe('');
    expect(mediaStatusBase(undefined,'','life-os-web-gray.vercel.app')).toBe('/api');
  });

  it('maps a safe server status payload into compact UI data',async()=>{
    const status=await readMediaStatus({
      baseUrl:'/api',
      fetchImpl:async()=>new Response(JSON.stringify({
        connected:true,
        provider:'yandex',
        digest:{summary:'Media Brain — в работе: 2, на проверке: 1, опубликовано: 3.',attention:['1 материал ждёт проверки.']},
      }),{status:200,headers:{'Content-Type':'application/json'}}),
    });
    expect(status.state).toBe('ready');
    expect(status.connected).toBe(true);
    expect(status.summary).toContain('в работе: 2');
    expect(status.attention).toEqual(['1 материал ждёт проверки.']);
  });

  it('accepts only a Yandex HTTPS authorization URL returned by the server',async()=>{
    const result=await beginYandexConnect({
      baseUrl:'/api',
      fetchImpl:async()=>new Response(JSON.stringify({authorizationUrl:'https://oauth.yandex.ru/authorize?client_id=x'}),{status:200,headers:{'Content-Type':'application/json'}}),
    });
    expect(result).toBe('https://oauth.yandex.ru/authorize?client_id=x');

    await expect(beginYandexConnect({
      baseUrl:'/api',
      fetchImpl:async()=>new Response(JSON.stringify({authorizationUrl:'https://evil.example.com/steal'}),{status:200,headers:{'Content-Type':'application/json'}}),
    })).rejects.toThrow('Yandex OAuth');
  });
});
