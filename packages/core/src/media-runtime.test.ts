import { describe, expect, it } from "vitest";
import {
  MediaRuntime,
  startMediaPolling,
  type MediaLeaseStore,
  type MediaRuntimeHealth,
  type MediaRuntimeHealthStore,
  type RecurringScheduler,
} from "./media-runtime";
import type { MediaSupervisorRun } from "./media-supervisor";

class LeaseStore implements MediaLeaseStore {
  locked = false;
  owner: string | null = null;
  renewCalls = 0;
  releaseCalls = 0;

  async acquire(_key:string, ownerId:string):Promise<boolean>{
    if(this.locked) return false;
    this.locked=true;
    this.owner=ownerId;
    return true;
  }
  async renew(_key:string, ownerId:string):Promise<boolean>{
    if(!this.locked || this.owner!==ownerId) return false;
    this.renewCalls+=1;
    return true;
  }
  async release(_key:string, ownerId:string):Promise<void>{
    if(this.owner===ownerId){
      this.locked=false;
      this.owner=null;
      this.releaseCalls+=1;
    }
  }
}

class HealthStore implements MediaRuntimeHealthStore {
  values: MediaRuntimeHealth[]=[];
  async save(value:MediaRuntimeHealth):Promise<void>{ this.values.push(value); }
}

class Scheduler implements RecurringScheduler {
  tasks=new Map<string,()=>Promise<void>>();
  stopped:string[]=[];
  async scheduleRecurring(input:{id:string;intervalMs:number;run:()=>Promise<void>}):Promise<()=>Promise<void>>{
    expect(input.intervalMs).toBeGreaterThan(0);
    this.tasks.set(input.id,input.run);
    return async()=>{ this.tasks.delete(input.id); this.stopped.push(input.id); };
  }
}

const supervisorRun:MediaSupervisorRun={
  ingestion:{importedAssetIds:["asset-1"],importedReferenceIds:[],existingAssetIds:[],existingReferenceIds:[],enqueuedJobIds:["job-1"]},
  passes:2,
  processed:[],
  stoppedBecause:"idle",
};

describe("MediaRuntime",()=>{
  it("runs one bounded supervisor cycle under a lease and records healthy state",async()=>{
    const lease=new LeaseStore();
    const health=new HealthStore();
    const scheduler=new Scheduler();
    let runs=0;
    const runtime=new MediaRuntime({
      supervisor:{runCycle:async()=>{runs+=1; return supervisorRun;}} as any,
      lease,
      health,
      heartbeatScheduler:scheduler,
      ownerId:"worker-a",
      now:()=>"2026-10-02T12:00:00.000Z",
      leaseTtlMs:60000,
    });

    const result=await runtime.runOnce();

    expect(result.status).toBe("completed");
    expect(runs).toBe(1);
    expect(lease.releaseCalls).toBe(1);
    expect(health.values.at(-1)).toMatchObject({status:"healthy",ownerId:"worker-a"});
    expect(scheduler.stopped.some(id=>id.includes("heartbeat"))).toBe(true);
  });

  it("skips safely when another worker holds the lease",async()=>{
    const lease=new LeaseStore();
    lease.locked=true;
    lease.owner="other";
    const health=new HealthStore();
    let runs=0;
    const runtime=new MediaRuntime({
      supervisor:{runCycle:async()=>{runs+=1; return supervisorRun;}} as any,
      lease,
      health,
      heartbeatScheduler:new Scheduler(),
      ownerId:"worker-a",
      now:()=>"2026-10-02T12:00:00.000Z",
    });

    const result=await runtime.runOnce();

    expect(result.status).toBe("skipped_locked");
    expect(runs).toBe(0);
    expect(health.values.at(-1)?.status).toBe("locked");
  });

  it("records failures and releases the lease so a later cycle can recover",async()=>{
    const lease=new LeaseStore();
    const health=new HealthStore();
    const runtime=new MediaRuntime({
      supervisor:{runCycle:async()=>{throw new Error("temporary provider failure");}} as any,
      lease,
      health,
      heartbeatScheduler:new Scheduler(),
      ownerId:"worker-a",
      now:()=>"2026-10-02T12:00:00.000Z",
    });

    const result=await runtime.runOnce();

    expect(result.status).toBe("failed");
    expect(result.error).toContain("temporary provider failure");
    expect(lease.locked).toBe(false);
    expect(health.values.at(-1)).toMatchObject({status:"error"});
  });

  it("registers provider-neutral polling without owning platform timers",async()=>{
    const scheduler=new Scheduler();
    let runs=0;
    const runtime={runOnce:async()=>{runs+=1; return {status:"completed" as const,run:supervisorRun,error:null};}};

    const stop=await startMediaPolling({runtime,scheduler,intervalMs:300000,id:"media-poll"});
    expect(scheduler.tasks.has("media-poll")).toBe(true);

    await scheduler.tasks.get("media-poll")!();
    expect(runs).toBe(1);

    await stop();
    expect(scheduler.tasks.has("media-poll")).toBe(false);
  });
});
