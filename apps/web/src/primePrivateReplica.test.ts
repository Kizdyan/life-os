import { describe, expect, it } from 'vitest';
import { queueMutation } from './runtimeSync';
import { applyRemotePrimePrivateRecords, PRIME_PRIVATE_JOURNAL_ID, primePrivateSnapshot, primePrivateVersion } from './primePrivateReplica';

class S {
  private readonly data = new Map<string,string>();
  getItem(key:string){return this.data.get(key) ?? null;}
  setItem(key:string,value:string){this.data.set(key,value);}
}
function record(journal:unknown, klass='PRIVATE', scope='blocked') {
  return {id:PRIME_PRIVATE_JOURNAL_ID,userId:'server-authenticated-owner',kind:'setting' as const,
    version:4,deleted:false,updatedAt:'2026-10-13T12:00:00Z',
    payload:{entityType:'prime_private_journal',privacyClass:klass,personaExposure:scope,journal}};
}
describe('Prime private journal uses the existing authenticated runtime replica',()=>{
  it('rejects unclassified or Persona-allowed response payloads',()=>{
    const s=new S(), privateJournal={events:[],audit:[]};
    applyRemotePrimePrivateRecords(s,[record(privateJournal,'PUBLIC_SAFE')]);
    applyRemotePrimePrivateRecords(s,[record(privateJournal,'PRIVATE','allowed')]);
    expect(primePrivateSnapshot(s)).toBeNull();
  });
  it('hydrates the same private journal identity from owner-scoped records',()=>{
    const s=new S(), j={events:[{id:'e1',type:'pause'}],audit:[]};
    applyRemotePrimePrivateRecords(s,[record(j)]);
    expect(JSON.parse(primePrivateSnapshot(s)!)).toEqual(j);
    expect(primePrivateVersion(s)).toBe(4);
  });
  it('does not silently overwrite pending offline private edits with older remote snapshot',()=>{
    const s=new S(), local={events:[{id:'local-newer'}],audit:[]};
    s.setItem('life-os:prime-build:private:v1',JSON.stringify(local));
    queueMutation(s,{mutationId:'pending-prime',recordId:PRIME_PRIVATE_JOURNAL_ID,userId:'self',
      kind:'setting',expectedVersion:3,deleted:false,clientUpdatedAt:'2026-10-13T12:01:00Z',
      payload:{entityType:'prime_private_journal',privacyClass:'PRIVATE',personaExposure:'blocked',journal:local}});
    applyRemotePrimePrivateRecords(s,[record({events:[{id:'old'}],audit:[]})]);
    expect(JSON.parse(primePrivateSnapshot(s)!)).toEqual(local);
  });
});
