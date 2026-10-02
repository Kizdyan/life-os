import type { MediaSupervisor, MediaSupervisorRun } from "./media-supervisor";

export interface MediaLeaseStore {
  acquire(key:string, ownerId:string, ttlMs:number, now:string):Promise<boolean>;
  renew(key:string, ownerId:string, ttlMs:number, now:string):Promise<boolean>;
  release(key:string, ownerId:string):Promise<void>;
}

export type MediaRuntimeHealthStatus="running"|"healthy"|"error"|"locked";

export interface MediaRuntimeHealth {
  status:MediaRuntimeHealthStatus;
  ownerId:string;
  updatedAt:string;
  lastStartedAt:string|null;
  lastCompletedAt:string|null;
  lastError:string|null;
  lastImportedCount:number;
  lastProcessedCount:number;
}

export interface MediaRuntimeHealthStore {
  save(value:MediaRuntimeHealth):Promise<void>;
}

export interface RecurringScheduler {
  scheduleRecurring(input:{
    id:string;
    intervalMs:number;
    run:()=>Promise<void>;
  }):Promise<()=>Promise<void>|void>;
}

export interface MediaRuntimeResult {
  status:"completed"|"skipped_locked"|"failed";
  run:MediaSupervisorRun|null;
  error:string|null;
}

export interface MediaRuntimeOptions {
  supervisor:Pick<MediaSupervisor,"runCycle">;
  lease:MediaLeaseStore;
  health:MediaRuntimeHealthStore;
  heartbeatScheduler:RecurringScheduler;
  ownerId:string;
  now:()=>string;
  leaseKey?:string;
  leaseTtlMs?:number;
}

export class MediaRuntime {
  private readonly leaseKey:string;
  private readonly leaseTtlMs:number;

  constructor(private readonly options:MediaRuntimeOptions){
    this.leaseKey=options.leaseKey?.trim()||"media-brain:poller";
    this.leaseTtlMs=Math.max(5000,Math.floor(options.leaseTtlMs??120000));
    if(!options.ownerId.trim()) throw new Error("Media runtime ownerId is required");
  }

  async runOnce():Promise<MediaRuntimeResult>{
    const startedAt=this.options.now();
    const acquired=await this.options.lease.acquire(
      this.leaseKey,
      this.options.ownerId,
      this.leaseTtlMs,
      startedAt,
    );

    if(!acquired){
      await this.options.health.save(this.health({
        status:"locked",
        updatedAt:startedAt,
        lastStartedAt:null,
        lastCompletedAt:null,
        lastError:null,
        imported:0,
        processed:0,
      }));
      return {status:"skipped_locked",run:null,error:null};
    }

    await this.options.health.save(this.health({
      status:"running",
      updatedAt:startedAt,
      lastStartedAt:startedAt,
      lastCompletedAt:null,
      lastError:null,
      imported:0,
      processed:0,
    }));

    const heartbeatId=`${this.leaseKey}:heartbeat:${this.options.ownerId}`;
    const stopHeartbeat=await this.options.heartbeatScheduler.scheduleRecurring({
      id:heartbeatId,
      intervalMs:Math.max(1000,Math.floor(this.leaseTtlMs/3)),
      run:async()=>{
        const renewed=await this.options.lease.renew(
          this.leaseKey,
          this.options.ownerId,
          this.leaseTtlMs,
          this.options.now(),
        );
        if(!renewed) throw new Error("Media runtime lease heartbeat was lost");
      },
    });

    try{
      const run=await this.options.supervisor.runCycle();
      const completedAt=this.options.now();
      const imported=run.ingestion.importedAssetIds.length+run.ingestion.importedReferenceIds.length;
      await this.options.health.save(this.health({
        status:"healthy",
        updatedAt:completedAt,
        lastStartedAt:startedAt,
        lastCompletedAt:completedAt,
        lastError:null,
        imported,
        processed:run.processed.length,
      }));
      return {status:"completed",run,error:null};
    }catch(error){
      const message=error instanceof Error?error.message:"Unknown Media Brain runtime failure";
      await this.options.health.save(this.health({
        status:"error",
        updatedAt:this.options.now(),
        lastStartedAt:startedAt,
        lastCompletedAt:null,
        lastError:message,
        imported:0,
        processed:0,
      }));
      return {status:"failed",run:null,error:message};
    }finally{
      await stopHeartbeat();
      await this.options.lease.release(this.leaseKey,this.options.ownerId);
    }
  }

  private health(input:{
    status:MediaRuntimeHealthStatus;
    updatedAt:string;
    lastStartedAt:string|null;
    lastCompletedAt:string|null;
    lastError:string|null;
    imported:number;
    processed:number;
  }):MediaRuntimeHealth{
    return {
      status:input.status,
      ownerId:this.options.ownerId,
      updatedAt:input.updatedAt,
      lastStartedAt:input.lastStartedAt,
      lastCompletedAt:input.lastCompletedAt,
      lastError:input.lastError,
      lastImportedCount:input.imported,
      lastProcessedCount:input.processed,
    };
  }
}

export async function startMediaPolling(input:{
  runtime:Pick<MediaRuntime,"runOnce">;
  scheduler:RecurringScheduler;
  intervalMs:number;
  id?:string;
}):Promise<()=>Promise<void>|void>{
  const intervalMs=Math.max(1000,Math.floor(input.intervalMs));
  return input.scheduler.scheduleRecurring({
    id:input.id?.trim()||"media-brain:poll",
    intervalMs,
    run:async()=>{ await input.runtime.runOnce(); },
  });
}
