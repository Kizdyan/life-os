import {afterEach,describe,expect,it,vi} from 'vitest';
import {createCloudProject,updateCloudProject,listCloudProjects,parseCloudProject,PersonaCloudRequestError} from './personaCloudProjects';

const valid={
 id:'6d6f6b66-1000-4000-8000-000000000001',
 owner_id:'6d6f6b66-1000-4000-8000-000000000002',
 local_project_key:'local-1',
 title:'Новый Reels',
 snapshot:{stage:'needs_assets'},
 revision:2,
 updated_at:'2026-10-28T10:00:00Z'
};

describe('Persona cloud project response validation',()=>{
 it('accepts a complete project record without changing its snapshot',()=>{
  const result=parseCloudProject(valid);
  expect(result).toEqual(valid);
  expect(result.snapshot).toBe(valid.snapshot);
 });
 it.each([null,undefined,[],42,'ok',{}, {project:valid}])('rejects unexpected RPC shape: %s',(value)=>{
  expect(()=>parseCloudProject(value)).toThrow(/Unexpected Persona cloud response/);
 });
 it.each([
  {id:undefined},
  {owner_id:undefined},
  {local_project_key:undefined},
  {title:undefined},
  {revision:-1},
  {revision:1.5},
  {revision:'2'},
  {updated_at:undefined},
  {snapshot:undefined}
 ])('rejects invalid or missing fields: %j',(patch)=>{
  const candidate={...valid,...patch};
  if('snapshot' in patch&&patch.snapshot===undefined)delete (candidate as Partial<typeof valid>).snapshot;
  expect(()=>parseCloudProject(candidate)).toThrow(/Unexpected Persona cloud response/);
 });
});

describe('Persona cloud project list',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const credentials={url:'https://example.supabase.co',publishableKey:'public-key',accessToken:'user-jwt'};
 it('rejects malformed server list instead of showing an empty library',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({error:'bad shape'})}));
  await expect(listCloudProjects(credentials)).rejects.toThrow(/project list required/);
 });
 it('rejects a malformed item within an otherwise valid list',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>[valid,{id:'invalid'}]}));
  await expect(listCloudProjects(credentials)).rejects.toThrow(/project fields missing/);
 });
 it('accepts valid list and sends the user token',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>[valid]});
  vi.stubGlobal('fetch',fetchMock);
  await expect(listCloudProjects(credentials)).resolves.toEqual([valid]);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/rest/v1/persona_projects?'),expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer user-jwt'})}));
 });
 it('does not make requests without a user token',async()=>{
  const fetchMock=vi.fn();
  vi.stubGlobal('fetch',fetchMock);
  await expect(listCloudProjects({...credentials,accessToken:'public-key'})).rejects.toThrow(/Sign in/);
  expect(fetchMock).not.toHaveBeenCalled();
 });
});

describe('Persona cloud HTTP errors',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const credentials={url:'https://example.supabase.co',publishableKey:'public-key',accessToken:'user-jwt'};
 it.each([
  [401,'Сессия истекла'],
  [403,'Нет доступа'],
  [409,'Конфликт версий'],
  [429,'Слишком много запросов'],
  [500,'Ошибка облака']
 ])('reports status %i without overwriting local data',async(status,fragment)=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status}));
  try{await listCloudProjects(credentials);throw Error('Expected cloud request to fail')}catch(error){
   expect(error).toBeInstanceOf(PersonaCloudRequestError);
   expect((error as PersonaCloudRequestError).status).toBe(status);
   expect((error as Error).message).toContain(fragment);
   expect((error as Error).message).toContain('Локальный черновик сохранён');
  }
 });
});

describe('Persona cloud project pagination',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const credentials={url:'https://example.supabase.co',publishableKey:'public-key',accessToken:'user-jwt'};
 it('loads a second page when the first page contains 50 projects',async()=>{
  const first=Array.from({length:50},(_,i)=>({...valid,id:'id-'+i}));
  const second=[{...valid,id:'id-50'}];
  const fetchMock=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>first}).mockResolvedValueOnce({ok:true,json:async()=>second});
  vi.stubGlobal('fetch',fetchMock);
  const result=await listCloudProjects(credentials);
  expect(result).toHaveLength(51);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[0][0]).toContain('offset=0');
  expect(fetchMock.mock.calls[1][0]).toContain('offset=50');
 });
 it('rejects a page larger than the requested limit',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>Array.from({length:51},()=>valid)}));
  await expect(listCloudProjects(credentials)).rejects.toThrow(/page limit exceeded/);
 });
 it('does not silently return partial results if a later page fails',async()=>{
  const first=Array.from({length:50},()=>valid);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce({ok:true,json:async()=>first}).mockResolvedValueOnce({ok:false,status:500}));
  await expect(listCloudProjects(credentials)).rejects.toThrow(/Ошибка облака/);
 });
});

describe('Persona cloud writes stay explicit and revision-aware',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const credentials={url:'https://example.supabase.co',publishableKey:'public-key',accessToken:'user-jwt'};
 it('creates with a stable request key and sends the exact snapshot',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>valid});
  vi.stubGlobal('fetch',fetchMock);
  const snapshot={stage:'needs_assets',clips:[1,2]};
  await expect(createCloudProject(credentials,{localKey:'local-1',title:'Новый Reels',snapshot,requestKey:'create-1'})).resolves.toEqual(valid);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/rpc/persona_create_project'),expect.objectContaining({
   method:'POST',body:JSON.stringify({p_local_project_key:'local-1',p_title:'Новый Reels',p_snapshot:snapshot,p_request_key:'create-1'})
  }));
 });
 it('updates with expected revision and mutation key',async()=>{
  const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({...valid,revision:3})});
  vi.stubGlobal('fetch',fetchMock);
  await expect(updateCloudProject(credentials,{projectId:valid.id,expectedRevision:2,snapshot:valid.snapshot,mutationKey:'update-1'})).resolves.toMatchObject({revision:3});
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/rpc/persona_update_project'),expect.objectContaining({
   body:JSON.stringify({p_project_id:valid.id,p_expected_revision:2,p_snapshot:valid.snapshot,p_mutation_key:'update-1'})
  }));
 });
 it('rejects missing idempotency key without sending a request',async()=>{
  const fetchMock=vi.fn();
  vi.stubGlobal('fetch',fetchMock);
  expect(()=>createCloudProject(credentials,{localKey:'local-1',title:'Draft',snapshot:{},requestKey:''})).toThrow(/Missing project identity/);
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it('rejects invalid revision without sending a request',async()=>{
  const fetchMock=vi.fn();
  vi.stubGlobal('fetch',fetchMock);
  expect(()=>updateCloudProject(credentials,{projectId:valid.id,expectedRevision:-1,snapshot:{},mutationKey:'update-2'})).toThrow(/Invalid project revision/);
  expect(fetchMock).not.toHaveBeenCalled();
 });
 it('does not treat revision conflict as a successful write',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false,status:409}));
  await expect(updateCloudProject(credentials,{projectId:valid.id,expectedRevision:2,snapshot:{},mutationKey:'update-3'})).rejects.toMatchObject({status:409});
 });
});

describe('Persona cloud project safety limit',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 const credentials={url:'https://example.supabase.co',publishableKey:'public-key',accessToken:'user-jwt'};
 it('accepts exactly 1000 projects after checking that no extra record exists',async()=>{
  const fetchMock=vi.fn().mockImplementation(async(url:string)=>{
   const offset=Number(new URL(url).searchParams.get('offset'));
   return {ok:true,json:async()=>offset===1000?[]:Array.from({length:50},(_,i)=>({...valid,id:'id-'+(offset+i)}))};
  });
  vi.stubGlobal('fetch',fetchMock);
  await expect(listCloudProjects(credentials)).resolves.toHaveLength(1000);
  expect(fetchMock).toHaveBeenCalledTimes(21);
  expect(fetchMock.mock.calls[20][0]).toContain('limit=1&offset=1000');
 });
 it('rejects 1001 projects rather than returning an incomplete list',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>{
   const offset=Number(new URL(url).searchParams.get('offset'));
   return {ok:true,json:async()=>offset===1000?[{...valid,id:'overflow'}]:Array.from({length:50},(_,i)=>({...valid,id:'id-'+(offset+i)}))};
  }));
  await expect(listCloudProjects(credentials)).rejects.toThrow(/слишком большой/);
 });
});
