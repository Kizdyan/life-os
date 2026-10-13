import { describe,expect,it } from 'vitest';
import { InMemoryDurableRuntimeStore } from '../../packages/core/src/runtime-storage';
import { publicationDurableStoreFromRuntime } from './_publisher-store';
import type { RuntimeRemoteStore } from './_store';

class ExistingRuntimeRpc implements RuntimeRemoteStore{
  private readonly inner=new InMemoryDurableRuntimeStore(()=> '2026-10-13T10:00:00.000Z');
  apply(principal:string,input:any){return this.inner.apply({...input,userId:principal,clientUpdatedAt:'2026-10-13T10:00:00.000Z'}) as any;}
  async listSince(principal:string){return (await this.inner.list(principal)).records as any;}
  async revision(principal:string){return (await this.inner.list(principal)).storeRevision;}
}

describe('Publisher durable server composition',()=>{
  it('survives reconstructed adapters over the existing runtime RPC',async()=>{const rpc=new ExistingRuntimeRpc();const first=publicationDurableStoreFromRuntime('owner-1',rpc)!;await first.apply({mutationId:'m1',userId:'owner-1',recordId:'publication-1',kind:'audit',expectedVersion:null,payload:{status:'READY_TO_PUBLISH'},deleted:false,clientUpdatedAt:'2026-10-13T10:00:00.000Z'});const restarted=publicationDurableStoreFromRuntime('owner-1',rpc)!;expect((await restarted.read('owner-1','publication-1'))?.payload).toEqual({status:'READY_TO_PUBLISH'});});
  it('fails closed when the approved durable backend is not configured',()=>{expect(publicationDurableStoreFromRuntime('owner-1',null)).toBeNull();});
});
