export type OutboxState='pending'|'syncing'|'synced'|'failed';

export interface OutboxMutation<T=unknown>{
  id:string;
  kind:string;
  payload:T;
  idempotencyKey:string;
  state:OutboxState;
  attempts:number;
  createdAt:string;
  lastError?:string;
}

export interface OutboxStore{
  enqueue<T>(mutation:OutboxMutation<T>):Promise<void>;
  pending():Promise<OutboxMutation[]>;
  update(mutation:OutboxMutation):Promise<void>;
}

export async function flushOutbox(store:OutboxStore,send:(m:OutboxMutation)=>Promise<void>,maxAttempts=5){
  const queue=await store.pending();
  for(const mutation of queue){
    if(mutation.attempts>=maxAttempts) continue;
    mutation.state='syncing';
    await store.update(mutation);
    try{
      await send(mutation);
      mutation.state='synced';
      mutation.lastError=undefined;
    }catch(error){
      mutation.state='failed';
      mutation.attempts+=1;
      mutation.lastError=error instanceof Error?error.message:'sync failed';
    }
    await store.update(mutation);
  }
}
