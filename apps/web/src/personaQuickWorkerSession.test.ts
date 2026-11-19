import {describe,it,expect,vi} from 'vitest';
import {fetchQuickWorkerWithReconnect} from './personaQuickWorkerSession';

const url='http://127.0.0.1:47831/quick-render';
const getHeader=(init:RequestInit|undefined)=>new Headers(init?.headers).get('X-Persona-Worker-Token');

describe('quick-render local Worker session recovery',()=>{
 it('sends the cached token and never renews a successful request',async()=>{
  const fetcher=vi.fn(async (_url:string,_init?:RequestInit)=>new Response('ok',{status:200}));
  const getToken=vi.fn(async()=> 'active');
  const renewToken=vi.fn(async()=> 'fresh');
  const response=await fetchQuickWorkerWithReconnect(url,{method:'GET'},getToken,renewToken,fetcher as typeof fetch);
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(getHeader(fetcher.mock.calls[0][1])).toBe('active');
  expect(renewToken).not.toHaveBeenCalled();
 });
 it('reauthenticates exactly once on 401 from a restarted Worker and preserves the original upload',async()=>{
  const body=new Blob(['real media payload'],{type:'video/mp4'});
  const fetcher=vi.fn(async (_url:string,_init?:RequestInit)=>
   new Response(null,{status:fetcher.mock.calls.length===1?401:200}));
  const getToken=vi.fn(async()=> 'previous-process-token');
  const renewToken=vi.fn(async()=> 'new-process-token');
  const response=await fetchQuickWorkerWithReconnect(url+'/job/upload/0',{
   method:'PUT',headers:{'X-Persona-Original-Name':'example.mp4'},body
  },getToken,renewToken,fetcher as typeof fetch);
  expect(response.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(renewToken).toHaveBeenCalledTimes(1);
  expect(getHeader(fetcher.mock.calls[0][1])).toBe('previous-process-token');
  expect(getHeader(fetcher.mock.calls[1][1])).toBe('new-process-token');
  for(const [,init] of fetcher.mock.calls){
   expect(init?.method).toBe('PUT');
   expect(init?.body).toBe(body);
   expect(new Headers(init?.headers).get('X-Persona-Original-Name')).toBe('example.mp4');
  }
 });
 it('does not repeat a failed mutation for HTTP 403, 404 or 500',async()=>{
  for(const status of [403,404,500]){
   const fetcher=vi.fn(async()=>new Response(null,{status}));
   const renewToken=vi.fn(async()=> 'new');
   const response=await fetchQuickWorkerWithReconnect(url,{method:'POST',body:'{"job":true}'},
    async()=> 'old',renewToken,fetcher as typeof fetch);
   expect(response.status).toBe(status);
   expect(fetcher).toHaveBeenCalledTimes(1);
   expect(renewToken).not.toHaveBeenCalled();
  }
 });
 it('never loops when a new Worker also rejects the token',async()=>{
  const fetcher=vi.fn(async()=>new Response(null,{status:401}));
  const renewToken=vi.fn(async()=> 'fresh');
  const response=await fetchQuickWorkerWithReconnect(url,{method:'POST'},async()=> 'old',
   renewToken,fetcher as typeof fetch);
  expect(response.status).toBe(401);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(renewToken).toHaveBeenCalledTimes(1);
 });
 it('propagates failed reconnect instead of claiming a render succeeded',async()=>{
  const fetcher=vi.fn(async()=>new Response(null,{status:401}));
  await expect(fetchQuickWorkerWithReconnect(url,{method:'POST'},async()=> 'old',async()=>{
   throw Error('Media Worker offline');
  },fetcher as typeof fetch)).rejects.toThrow(/offline/);
  expect(fetcher).toHaveBeenCalledTimes(1);
 });
});
