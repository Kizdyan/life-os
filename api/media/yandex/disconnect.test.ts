import{afterEach,describe,expect,it}from'vitest';import handler from'./disconnect';
const original={...process.env};afterEach(()=>{process.env={...original}});

describe('Yandex disconnect endpoint',()=>{
  it('clears the interactive token cookie',async()=>{delete process.env.YANDEX_DISK_OAUTH_TOKEN;const response=await handler.fetch(new Request('https://life.example.com/api/media/yandex/disconnect',{method:'POST'}));expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('lifeos_yandex_token=');expect(response.headers.get('set-cookie')).toContain('Max-Age=0');const payload=await response.json() as any;expect(payload).toMatchObject({connected:false,autonomousReady:false})});
  it('does not pretend an environment-managed autonomous token was disconnected',async()=>{process.env.YANDEX_DISK_OAUTH_TOKEN='durable-server-token';const response=await handler.fetch(new Request('https://life.example.com/api/media/yandex/disconnect',{method:'POST'}));const payload=await response.json() as any;expect(payload).toMatchObject({connected:true,envManaged:true,autonomousReady:true})});
});
