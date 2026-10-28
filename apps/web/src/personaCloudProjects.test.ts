import {afterEach,describe,expect,it,vi} from 'vitest';
import {listCloudProjects,parseCloudProject} from './personaCloudProjects';

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
