import { RemoteDurablePublicationStore, type RemotePublicationRuntime } from '../../packages/core/src/publisher-v1.js';
import type { RuntimeRecord, SyncResult } from '../../packages/core/src/runtime-storage.js';
import { runtimeStoreFromEnv, type RuntimeMutationInput, type RuntimeRemoteStore } from './_store.js';

/**
 * Server-only composition of Publisher V1 with the existing Supabase durable
 * runtime RPC. The service credential remains inside the approved API/Edge
 * boundary; clients receive only canonical job state.
 */
export function publicationDurableStoreFromRuntime(userId:string,remote:RuntimeRemoteStore|null=runtimeStoreFromEnv()){
  const principal=userId.trim();if(!principal)throw new Error('Publisher principal is required');if(!remote)return null;
  const bridge:RemotePublicationRuntime={
    async apply(owner,mutation){return remote.apply(owner,mutation as RuntimeMutationInput) as unknown as Promise<SyncResult>;},
    async listSince(owner,sinceRevision){return remote.listSince(owner,sinceRevision) as unknown as Promise<RuntimeRecord[]>;},
    revision(owner){return remote.revision(owner)},
  };
  return new RemoteDurablePublicationStore(bridge,principal);
}

