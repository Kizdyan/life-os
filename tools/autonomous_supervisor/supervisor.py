#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,os,re,shlex,shutil,signal,sqlite3,subprocess,threading,time,uuid,fcntl,selectors
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from local_coding_adapter import LocalCodingError,apply_edits,build_prompt,build_repair_context,diff_fingerprint,order_checks,parse_response,prepare_command,validate_changed_paths,validate_required_changes,validate_test_integrity
from codex_budget import evaluate_budget,normalize_rate_limits,read_rate_limits

QUOTA=[re.compile(x,re.I) for x in ("usage limit","rate limit","quota","credits? exhausted","limit.*reset",r"\b429\b")]
CODEX_UNAVAILABLE=[re.compile(x,re.I) for x in (r"workspace routing discovery failed",r"reconnecting\.\.\.",r"please try again later",r"status\.openai\.com",r"service unavailable")]
def now(): return datetime.now(timezone.utc).isoformat()
def jd(x): return json.dumps(x,ensure_ascii=False,separators=(",",":"))
def quota(s): return any(p.search(s) for p in QUOTA)
def codex_unavailable(s): return quota(s) or any(p.search(s) for p in CODEX_UNAVAILABLE)
def codex_result_available(code,out):return code==0 and not codex_unavailable(out)
def default_codex_command(): return ["codex","exec","--approve-for-me","-"]
def repair_prompt(base,command,code,out): return (base+"\n\nBOUNDED REPAIR ONLY. The previous verified command failed: "+command+" (exit "+str(code)+"). Diagnose and fix only that failure, preserve the existing bounded diff, then rerun the failing command. Evidence tail:\n"+out[-3000:])[-4800:]
def critic_clean(out): return bool(re.search(r"no actionable (?:findings|regressions|defects)|no critical issues",out,re.I))
def critic_command(dirty,base): return ["codex","exec","review","--uncommitted"] if dirty else ["codex","exec","review","--base",base]
def job_executor(job):
    if job.get("state")=="LOCAL_READY_PENDING_CODEX_REVIEW":return "CODEX"
    kind=job.get("kind");payload=job.get("payload",{})
    if kind=="codex":return "CODEX"
    # Risk > 1 cannot be delegated to the restricted local AI. This must agree
    # with local_ai_job's security check, otherwise risk=2 always fails.
    if kind=="local_ai":return "CODEX" if int(payload.get("risk",1))>1 else "LOCAL_AI"
    return "DETERMINISTIC"
def required_capabilities(job):
    executor=job_executor(job)
    if job.get("state")=="LOCAL_READY_PENDING_CODEX_REVIEW":return {"CODEX"}
    declared=job.get("payload",{}).get("requires")
    if isinstance(declared,str):declared=[declared]
    required={str(x).upper() for x in declared} if declared else set()
    # Declared requirements may add prerequisites, never bypass the executor
    # authorization (especially CODEX for risky local_ai jobs).
    required.add("CODEX" if executor=="CODEX" else ("LOCAL_AI" if executor=="LOCAL_AI" else "SHELL"))
    return required
def codex_budget_allows(job,scheduler_policy=None):
    if job_executor(job)!="CODEX":return True
    scheduler_policy=scheduler_policy or {};budget=scheduler_policy.get("_codexBudget")
    if not isinstance(budget,dict):return True
    if budget.get("state") in ("DISABLED_BY_USER","NOT_CONFIGURED"):return False
    decision=evaluate_budget(budget.get("snapshot"),scheduler_policy.get("_codexBudgetPolicy",{}),job.get("payload",{}).get("budgetEstimate",{}),scheduler_policy.get("_clock"))
    return decision.get("state") not in ("DRAIN","QUOTA_BLOCKED","UNKNOWN")

RUNNABLE_STATES={"QUEUED","WAITING_FOR_CODEX","LOCAL_READY_PENDING_CODEX_REVIEW"}
TERMINAL_STATES={"READY","LOCAL_VERIFIED","INTEGRATED","ACCEPTED","SUPERSEDED","FAILED","CANCELLED","HUMAN_REQUIRED"}
DEPENDENCY_SATISFIED_STATES={"READY","LOCAL_VERIFIED","INTEGRATED","ACCEPTED","SUPERSEDED"}

def eligibility_reasons(job,capabilities,states=None,clock=None):
    state=job["state"]
    if state not in RUNNABLE_STATES:return ["STATE_"+state]
    reasons=[]
    for need in sorted(required_capabilities(job)):
        if capabilities.get(need,"UNAVAILABLE") not in (("AVAILABLE","PROBE_DUE") if need=="CODEX" else ("AVAILABLE",)):
            reasons.append("CAPABILITY_"+need+"_"+str(capabilities.get(need,"UNAVAILABLE")))
    deadline=job.get("not_before")
    if deadline is not None and float(deadline)>(time.time() if clock is None else clock):
        reasons.append("RETRY_COOLDOWN")
    if states is not None:
        for dep in job.get("payload",{}).get("dependencies",[]):
            if states.get(dep) not in DEPENDENCY_SATISFIED_STATES:reasons.append("DEPENDENCY_"+str(dep)+"_"+str(states.get(dep,"MISSING")))
    return reasons

def safe_tail(message,limit=1200):
    message=str(message)[-limit:]
    message=re.sub(r"\x1b\[[0-9;]*[A-Za-z]","",message)
    message=re.sub(r"(?i)(authorization\s*:\s*bearer\s+)\S+",r"\1[REDACTED]",message)
    message=re.sub(r"(?i)((?:api[_-]?key|access[_-]?token|secret|password|control[_-]?token)\s*[=:]\s*)\S+",r"\1[REDACTED]",message)
    message=re.sub(r"\bsk-[A-Za-z0-9_-]{12,}","[REDACTED]",message)
    return message
def capability_status(store,name,default="AVAILABLE"):
    raw=store.meta("capability."+name)
    if not raw:return {"status":default}
    try:return json.loads(raw)
    except:return {"status":"ERROR","reason":"invalid durable capability state"}
def set_capability(store,name,status,**extra):store.setmeta("capability."+name,jd({"status":status,**extra,"updated_at":now()}))
def record_local_ai_success(store,job_id,verified_at=None):
    store.setmeta("local_ai.last_success_at",verified_at or now())
    store.setmeta("local_ai.semantic_verification","PASSED_REAL_CODE_E2E_LOCAL_VERIFIED:"+str(job_id))
def reconcile_local_ai_success(store):
    verified=[j for j in store.jobs(10000) if j.get("state")=="LOCAL_VERIFIED" and j.get("payload",{}).get("executor_used")=="LOCAL_AI"]
    if verified:
        latest=max(verified,key=lambda j:j.get("updated_at") or "")
        record_local_ai_success(store,latest["id"],latest.get("updated_at"))
EXECUTION_MODES={"LOCAL_ONLY","CODEX_ALLOWED","AUTO_HYBRID"}
def execution_mode(store):
    mode=store.meta("execution_mode") or "CODEX_ALLOWED"
    return mode if mode in EXECUTION_MODES else "LOCAL_ONLY"
def set_execution_mode(store,mode):
    if mode not in EXECUTION_MODES:raise ValueError("invalid execution mode")
    previous=execution_mode(store);store.setmeta("execution_mode",mode)
    if mode in ("CODEX_ALLOWED","AUTO_HYBRID"):
        if mode=="CODEX_ALLOWED" or capability_status(store,"CODEX").get("status","AVAILABLE")=="AVAILABLE":store.release_codex_waits()
        state=capability_status(store,"CODEX");state.pop("manual_hold",None)
        store.setmeta("capability.CODEX",jd(state))
    store.event(None,"EXECUTION_MODE_CHANGED",mode,{"previous":previous,"mode":mode})
    return mode
def load_planner_registry(root:Path,mission:dict,configured=None)->dict:
    path=Path(configured).expanduser() if configured else root/"planner-registry.v1.json"
    if not path.is_absolute():path=(root/path).resolve()
    if not path.exists():return mission
    data=json.loads(path.read_text());items=data if isinstance(data,list) else data.get("items",[])
    if not isinstance(items,list):raise ValueError("planner registry items must be a list")
    milestones=data.get("milestones",[]) if isinstance(data,dict) else []
    if not isinstance(milestones,list):raise ValueError("planner registry milestones must be a list")
    policy=data.get("policy",{}) if isinstance(data,dict) else {}
    if not isinstance(policy,dict):raise ValueError("planner registry policy must be an object")
    return {**mission,"plannerRegistry":items,"plannerMilestones":milestones,"plannerPolicy":policy,"plannerRegistryVersion":data.get("version") if isinstance(data,dict) else None}
def capabilities_allow(job,capabilities):return all(capabilities.get(x,"UNAVAILABLE") in (("AVAILABLE","PROBE_DUE") if x=="CODEX" else ("AVAILABLE",)) for x in required_capabilities(job))
def job_product(job):
    explicit=job.get("payload",{}).get("product")
    if explicit:return explicit
    stream=job.get("payload",{}).get("workstream","")
    if stream in {"CONTENT_CONVEYOR","ARCHETYPE_BRAND","PERSONA_INTELLIGENCE","MEDIA_INTAKE","VIDEO","CAROUSEL","PHOTO","QUALITY_COURT","PUBLISHER","METRICS","LEARNING"}:return "PERSONA"
    if stream in {"TRUTH","SYNC","PRIVACY","ERIKA","CANONICAL_INTEGRATION"}:return "LIFE_OS"
    return "SHARED"
def advance_milestones(store,mission):
    milestones=mission.get("plannerMilestones",[])
    if not milestones:return []
    jobs={j["id"]:j for j in store.jobs(10000)}
    accepted=set()
    for milestone in milestones:
        mid=str(milestone.get("id") or "")
        evidence=milestone.get("evidenceJobs",[])
        proven=bool(evidence) and all(jobs.get(j,{}).get("state") in DEPENDENCY_SATISFIED_STATES for j in evidence)
        if mid and store.meta("milestone.accepted."+mid):accepted.add(mid);continue
        if milestone.get("status")=="ACCEPTED" and proven:accepted.add(mid);continue
        if milestone.get("status")=="APPROVED" and store.meta("milestone.active."+mid) and proven:
            decision={"acceptedAt":now(),"evidenceJobs":list(evidence)}
            store.setmeta("milestone.accepted."+mid,jd(decision));store.event(None,"MILESTONE_ACCEPTED",mid,decision);accepted.add(mid)
    activated=[]
    for milestone in milestones:
        mid=str(milestone.get("id") or "")
        deps={str(x) for x in milestone.get("dependsOn",[])}
        if not mid or milestone.get("status")!="APPROVED" or not deps.issubset(accepted):continue
        key="milestone.active."+mid
        if store.meta(key):continue
        decision={"activatedAt":now(),"dependsOn":sorted(deps),"acceptedEvidence":sorted(accepted),"sourceRequirement":milestone.get("sourceRequirement")}
        store.setmeta(key,jd(decision));store.event(None,"MILESTONE_ACTIVATED",mid,decision);activated.append(mid)
    return activated
def reconcile_registry_outcomes(store,mission,current_head,is_ancestor):
    registry={str(item.get("id")):item for item in mission.get("plannerRegistry",[]) if item.get("id")}
    jobs={j["id"]:j for j in store.jobs(10000)};changed=[]
    for jid,item in registry.items():
        integrated_sha=str(item.get("integratedSha") or "")
        job=jobs.get(jid)
        if not job or not integrated_sha or job["state"] in {"INTEGRATED","ACCEPTED"}:continue
        if not is_ancestor(integrated_sha,current_head):continue
        payload={**job["payload"],"integrated_sha":integrated_sha,"integration_head":current_head,"integration_verified_at":now()}
        store.payload(jid,payload);store.state(jid,"ACCEPTED" if item.get("status")=="ACCEPTED" else "INTEGRATED")
        store.event(jid,"INTEGRATION_CONFIRMED",integrated_sha,{"head":current_head,"sourceRequirement":item.get("sourceRequirement"),"targetVersion":item.get("targetVersion")})
        jobs[jid]={**job,"state":"ACCEPTED" if item.get("status")=="ACCEPTED" else "INTEGRATED","payload":payload};changed.append(jid)
    for jid,item in registry.items():
        replacement_id=str(item.get("supersededBy") or "")
        job=jobs.get(jid);replacement=registry.get(replacement_id);replacement_job=jobs.get(replacement_id)
        if not job or not replacement or not replacement_job or job["state"]=="SUPERSEDED":continue
        equivalent=(jid in replacement.get("replaces",[]) and item.get("sourceRequirement")==replacement.get("sourceRequirement") and item.get("targetVersion")==replacement.get("targetVersion"))
        proven=replacement_job["state"] in {"INTEGRATED","ACCEPTED"}
        if not equivalent or not proven:continue
        payload={**job["payload"],"superseded_by":replacement_id,"supersession_verified_at":now(),"supersession_integrated_sha":replacement_job["payload"].get("integrated_sha")}
        store.payload(jid,payload);store.state(jid,"SUPERSEDED")
        store.event(jid,"SUPERSESSION_CONFIRMED",replacement_id,{"sourceRequirement":item.get("sourceRequirement"),"targetVersion":item.get("targetVersion"),"integratedSha":payload["supersession_integrated_sha"]})
        jobs[jid]={**job,"state":"SUPERSEDED","payload":payload};changed.append(jid)
    return changed
def replenish_backlog(store,mission,capabilities=None,scheduler_policy=None):
    items=mission.get("backlog",[]);jobs=store.jobs(10000);by_id={j["id"]:j for j in jobs};added=0
    for item in items:
        if item["id"] in by_id:continue
        store.add(item["title"],item.get("kind","codex"),item.get("payload",{}),int(item.get("priority",100)),item["id"]);added+=1
    if added:return added
    queue_depth=max(1,int(mission.get("plannerPolicy",{}).get("approvedLocalQueueDepth",1) or 1))
    if queue_depth>1:
        advance_milestones(store,mission)
        jobs=store.jobs(10000);by_id={j["id"]:j for j in jobs};states={j["id"]:j["state"] for j in jobs}
        def occupies_prepared_slot(job):
            if job["kind"]!="local_ai" or job["state"] in TERMINAL_STATES:return False
            dependencies=job.get("payload",{}).get("dependencies",[])
            return not any(states.get(dep) in TERMINAL_STATES and states.get(dep) not in DEPENDENCY_SATISFIED_STATES for dep in dependencies)
        active_local=sum(1 for j in jobs if occupies_prepared_slot(j))
        registry=sorted(mission.get("plannerRegistry",[]),key=lambda item:(int(item.get("priority",100)),str(item.get("id",""))))
        for item in registry:
            if active_local>=queue_depth:break
            required=(item.get("id"),item.get("title"),item.get("sourceRequirement"),item.get("targetVersion"),item.get("acceptance"))
            status=item.get("status","ACTIVE");milestone=str(item.get("milestone") or "")
            activated=bool(milestone and store.meta("milestone.active."+milestone))
            if item.get("kind")!="local_ai" or (status!="ACTIVE" and not (status=="PLANNED" and activated)):continue
            if not all(required) or item["id"] in by_id:continue
            payload={**item.get("payload",{}),"planner_source_requirement":item["sourceRequirement"],"target_version":item["targetVersion"],"acceptance":item["acceptance"]}
            probe={"id":item["id"],"state":"QUEUED","kind":"local_ai","payload":payload}
            reasons=eligibility_reasons(probe,capabilities or {"CODEX":"AVAILABLE","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"},states)
            if any(not reason.startswith("DEPENDENCY_") for reason in reasons):continue
            store.add(item["title"],"local_ai",payload,int(item.get("priority",100)),item["id"])
            store.event(item["id"],"PLANNER_SEEDED",item["sourceRequirement"],{"target_version":item["targetVersion"],"product":job_product(probe),"prepared_ahead":True})
            by_id[item["id"]]=probe;states[item["id"]]="QUEUED";active_local+=1;added+=1
        if added:return added
    if capabilities is None:
        active={"QUEUED","PREPARING","CODING","TESTING","CRITIC","WAITING_FOR_CODEX"}
        if any(j["state"] in active for j in store.jobs(10000)):return 0
    elif store.pick(capabilities,scheduler_policy or mission.get("schedulerPolicy")):return 0
    # An explicit independent fallback backlog is always eligible for seeding,
    # even when the latest ROADMAP job failed or is waiting on Codex.
    fallback=mission.get("fallbackBacklog",[])
    added=0
    for item in fallback:
        if item["id"] in by_id:continue
        store.add(item["title"],item.get("kind","shell"),item.get("payload",{}),int(item.get("priority",100)),item["id"]);added+=1
    if added:return added
    # A registry item is a version-scoped, evidence-bearing requirement, not a
    # generated activity placeholder. Seed at most one independently runnable
    # item per idle cycle and never reuse an existing durable id.
    advance_milestones(store,mission)
    states={j["id"]:j["state"] for j in store.jobs(10000)}
    registry=sorted(mission.get("plannerRegistry",[]),key=lambda item:(int(item.get("priority",100)),str(item.get("id",""))))
    for item in registry:
        required=(item.get("id"),item.get("title"),item.get("sourceRequirement"),item.get("targetVersion"),item.get("acceptance"))
        status=item.get("status","ACTIVE");milestone=str(item.get("milestone") or "")
        activated=bool(milestone and store.meta("milestone.active."+milestone))
        if status!="ACTIVE" and not (status=="PLANNED" and activated):continue
        if not all(required) or item["id"] in by_id:continue
        payload={**item.get("payload",{}),"planner_source_requirement":item["sourceRequirement"],"target_version":item["targetVersion"],"acceptance":item["acceptance"]}
        probe={"id":item["id"],"state":"QUEUED","kind":item.get("kind","codex"),"payload":payload}
        if eligibility_reasons(probe,capabilities or {"CODEX":"AVAILABLE","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"},states):continue
        store.add(item["title"],item.get("kind","codex"),payload,int(item.get("priority",100)),item["id"])
        store.event(item["id"],"PLANNER_SEEDED",item["sourceRequirement"],{"target_version":item["targetVersion"],"product":job_product(probe)})
        return 1
    roadmaps=[j for j in store.jobs(10000) if re.fullmatch(r"ROADMAP-\d+",j["id"])]
    last=max(roadmaps,key=lambda j:int(j["id"].split("-")[-1])) if roadmaps else None
    # Never manufacture duplicates of an unresolved continuation. Failed
    # ROADMAP tasks require explicit review or independent fallback work.
    if last and last["state"]!="READY":return 0
    continuation=mission.get("continuation")
    if not continuation:return 0
    # Continuations are opt-in but must specify an executable payload.
    payload=continuation.get("payload",{})
    if not isinstance(payload,dict) or not (payload.get("command") or payload.get("prompt")):return 0
    seq=1+max([int(j["id"].split("-")[-1]) for j in roadmaps] or [0]);jid=f"ROADMAP-{seq:03d}"
    store.add(continuation["title"],continuation.get("kind","codex"),payload,int(continuation.get("priority",100)),jid);return 1

def resolve_base(store,payload,default):
    deps=payload.get("dependencies",[])
    if deps:
        jobs={j["id"]:j for j in store.jobs(10000)}
        for dep in reversed(deps):
            candidate=jobs.get(dep,{}).get("payload",{}).get("candidate_sha")
            if candidate:return candidate
    return payload.get("base_ref") or default

class Store:
    def __init__(self,path:Path):
        path.parent.mkdir(parents=True,exist_ok=True); self.c=sqlite3.connect(path,check_same_thread=False); self.c.row_factory=sqlite3.Row; self.l=threading.RLock()
        with self.c:self.c.executescript("""PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY,v TEXT NOT NULL,t TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,title TEXT NOT NULL,priority INTEGER NOT NULL,state TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,not_before REAL,last_error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,job_id TEXT,type TEXT NOT NULL,msg TEXT NOT NULL,data TEXT,created_at TEXT NOT NULL);""")
        if self.meta("paused") is None:self.setmeta("paused","0")
    def meta(self,k):
        with self.l:r=self.c.execute("SELECT v FROM meta WHERE k=?",(k,)).fetchone();return None if r is None else r["v"]
    def setmeta(self,k,v):
        with self.l,self.c:self.c.execute("INSERT INTO meta(k,v,t) VALUES(?,?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v,t=excluded.t",(k,str(v),now()))
    def event(self,j,t,m,d=None):
        with self.l,self.c:self.c.execute("INSERT INTO events(job_id,type,msg,data,created_at) VALUES(?,?,?,?,?)",(j,t,m,jd(d) if d is not None else None,now()))
    def add(self,title,kind,payload,priority=100,jid=None):
        jid=jid or "JOB-"+uuid.uuid4().hex[:10]; t=now()
        with self.l,self.c:self.c.execute("INSERT INTO jobs(id,title,priority,state,kind,payload,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",(jid,title,priority,"QUEUED",kind,jd(payload),t,t))
        self.event(jid,"JOB_QUEUED",title,payload); return jid
    def jobs(self,n=100):
        with self.l:rows=self.c.execute("SELECT * FROM jobs ORDER BY priority,created_at LIMIT ?",(n,)).fetchall()
        return [self.row(r) for r in rows]
    def row(self,r):d=dict(r);d["payload"]=json.loads(d["payload"]);return d
    def pick(self,capabilities=None,scheduler_policy=None):
        if capabilities is None:capabilities={"CODEX":"AVAILABLE","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
        with self.l:rows=self.c.execute("SELECT * FROM jobs WHERE state IN ('QUEUED','WAITING_FOR_CODEX','LOCAL_READY_PENDING_CODEX_REVIEW') ORDER BY priority,created_at").fetchall()
        all_jobs=self.jobs(10000);states={j["id"]:j["state"] for j in all_jobs}
        eligible=[self.row(r) for r in rows if not eligibility_reasons(self.row(r),capabilities,states) and codex_budget_allows(self.row(r),scheduler_policy)]
        if not eligible:return None
        limit=int((scheduler_policy or {}).get("maxConsecutiveJobsPerProduct",0) or 0)
        last=self.meta("scheduler.last_product");streak=int(self.meta("scheduler.consecutive_product_jobs") or 0)
        if limit and last and streak>=limit:
            alternative=next((job for job in eligible if job_product(job)!=last),None)
            if alternative:return alternative
        return eligible[0]
    def state(self,j,s,error=None,not_before=None,bump=False):
        with self.l,self.c:
            self.c.execute("UPDATE jobs SET state=?,last_error=?,not_before=?,attempts=attempts+?,updated_at=? WHERE id=?",(s,error,not_before,1 if bump else 0,now(),j))
        self.event(j,"STATE",s,{"error":error,"not_before":not_before})
    def release_codex_waits(self):
        with self.l,self.c:self.c.execute("UPDATE jobs SET not_before=NULL,updated_at=? WHERE state IN ('WAITING_FOR_CODEX','LOCAL_READY_PENDING_CODEX_REVIEW')",(now(),))
    def payload(self,j,p):
        with self.l,self.c:self.c.execute("UPDATE jobs SET payload=?,updated_at=? WHERE id=?",(jd(p),now(),j))
    def overview(self):
        with self.l:
            counts={r["state"]:r["n"] for r in self.c.execute("SELECT state,COUNT(*) n FROM jobs GROUP BY state")}
            ready=self.c.execute("SELECT * FROM jobs WHERE state='READY' ORDER BY updated_at DESC LIMIT 1").fetchone()
            event=self.c.execute("SELECT * FROM events ORDER BY seq DESC LIMIT 1").fetchone()
        return {"counts":counts,"last_ready":None if ready is None else self.row(ready),"last_event":None if event is None else dict(event)}
    def job_diagnostics(self,capabilities):
        jobs=self.jobs(10000);states={j["id"]:j["state"] for j in jobs}
        result=[]
        for j in jobs:
            reasons=eligibility_reasons(j,capabilities,states)
            result.append({"id":j["id"],"product":job_product(j),"state":j["state"],
                "executor":job_executor(j),"required_capabilities":sorted(required_capabilities(j)),
                "runnable":not bool(reasons),"reason_not_runnable":reasons,
                "dependencies":list(j["payload"].get("dependencies",[])),
                "next_retry_at":j.get("not_before"),"attempts":j["attempts"],
                "last_error":safe_tail(j.get("last_error") or "",500)})
        return result
    def queue_summary(self,capabilities):
        detail=self.job_diagnostics(capabilities)
        reasons={}
        for j in detail:
            if j["state"] in RUNNABLE_STATES:
                for reason in j["reason_not_runnable"]:reasons[reason]=reasons.get(reason,0)+1
        return {"runnable":sum(j["runnable"] for j in detail),
            "waiting_codex":sum(j["state"] in ("WAITING_FOR_CODEX","LOCAL_READY_PENDING_CODEX_REVIEW") for j in detail),
            "waiting_human":sum(j["state"]=="HUMAN_REQUIRED" for j in detail),
            "ready":sum(j["state"] in DEPENDENCY_SATISFIED_STATES for j in detail),
            "locally_verified":sum(j["state"]=="LOCAL_VERIFIED" for j in detail),
            "integrated":sum(j["state"] in ("INTEGRATED","ACCEPTED") for j in detail),
            "superseded":sum(j["state"]=="SUPERSEDED" for j in detail),
            "blocked_reasons":reasons}
    def stop_wait_diagnostic(self,capabilities,mission):
        summary=self.queue_summary(capabilities)
        detail=self.job_diagnostics(capabilities)
        pending=[j for j in detail if j["state"] in RUNNABLE_STATES]
        latest=[j for j in detail if re.fullmatch(r"ROADMAP-\d+",j["id"])]
        last=max(latest,key=lambda j:int(j["id"].split("-")[-1])) if latest else None
        if pending:reason="NO_ELIGIBLE_TASKS"
        elif last and last["state"]!="READY" and mission.get("continuation"):reason="CONTINUATION_BLOCKED_BY_ROADMAP"
        elif not mission.get("continuation") and not mission.get("fallbackBacklog"):reason="NO_CONFIGURED_FURTHER_WORK"
        else:reason="NO_PENDING_JOBS"
        record={"reason":reason,"blocked_reasons":summary["blocked_reasons"],"last_roadmap":last["id"] if last else None,"last_roadmap_state":last["state"] if last else None}
        encoded=jd(record)
        if encoded!=self.meta("scheduler.last_idle_reason"):
            self.setmeta("scheduler.last_idle_reason",encoded)
            self.event(None,"SCHEDULER_IDLE",reason,record)
    def recover_interrupted(self):
        states=("PREPARING","CODING","TESTING","CRITIC")
        with self.l,self.c:
            rows=self.c.execute("SELECT id FROM jobs WHERE state IN (?,?,?,?)",states).fetchall()
            ids=[r["id"] for r in rows]
            for jid in ids:
                self.c.execute("UPDATE jobs SET state='QUEUED',last_error=?,not_before=NULL,updated_at=? WHERE id=?",("recovered after supervisor restart",now(),jid))
        for jid in ids:self.event(jid,"RECOVERY","requeued interrupted job")
        return ids
    def events(self,n=100):
        with self.l:rows=self.c.execute("SELECT * FROM events ORDER BY seq DESC LIMIT ?",(n,)).fetchall()
        return [dict(r) for r in rows]

class Runner:
    def __init__(self,cfg,store):
        self.cfg=cfg;self.s=store;self.mission=cfg.get("_mission",{});self.stop=threading.Event();self.proc=None;self.current=None;self.s.recover_interrupted();reconcile_local_ai_success(self.s)
    def heartbeat_loop(self):
        while not self.stop.wait(min(10,self.cfg["loop_seconds"])):
            self.s.setmeta("heartbeat_at",now())
    def refresh_codex_budget(self):
        if execution_mode(self.s)=="LOCAL_ONLY":
            state={"state":"DISABLED_BY_USER","source":"execution_mode","updatedAt":now()}
            self.s.setmeta("codex.budget",jd(state));return state
        if not self.cfg.get("codex_budget_enabled",False):return {"state":"NOT_CONFIGURED","source":"config"}
        try:prior=json.loads(self.s.meta("codex.budget") or "null")
        except Exception:prior=None
        refresh=float(self.cfg.get("codex_budget_refresh_seconds",300))
        if isinstance(prior,dict) and prior.get("refreshedAt") and time.time()-float(prior["refreshedAt"])<refresh:return prior
        try:
            reader=self.cfg.get("codex_budget_reader")
            command=self.cfg.get("codex_budget_command")
            result=reader() if callable(reader) else read_rate_limits(command=command,timeout=float(self.cfg.get("codex_budget_timeout_seconds",10)))
            refreshed=time.time();snapshot=normalize_rate_limits(result,refreshed)
            decision=evaluate_budget(snapshot,self.cfg.get("codex_budget_policy",{}),self.cfg.get("codex_default_estimate",{}),refreshed)
            state={**decision,"snapshot":snapshot,"refreshedAt":refreshed}
            self.s.setmeta("codex.budget",jd(state));self.s.event(None,"CODEX_BUDGET_REFRESHED",state["state"],{"source":"codex_app_server","observedAt":refreshed})
            return state
        except Exception as exc:
            state={"state":"UNKNOWN","source":"codex_app_server","reason":safe_tail(exc,300),"refreshedAt":time.time()}
            self.s.setmeta("codex.budget",jd(state));self.s.event(None,"CODEX_BUDGET_REFRESH_FAILED","UNKNOWN",{"reason":state["reason"]});return state
    def capabilities(self):
        budget=self.refresh_codex_budget()
        forced=os.getenv("SUPERVISOR_FORCE_CODEX_UNAVAILABLE")=="1" or bool(self.cfg.get("force_codex_unavailable",False))
        codex=capability_status(self.s,"CODEX")
        retry=float(codex.get("retry_at",0) or 0)
        if forced:
            codex_status="WAITING_FOR_QUOTA"
            if codex.get("reason")!="forced":set_capability(self.s,"CODEX","WAITING_FOR_QUOTA",retry_at=0,reason="forced")
        elif codex.get("manual_hold"):codex_status=codex.get("status","ERROR")
        elif codex.get("status") in ("WAITING_FOR_QUOTA","ERROR") and retry>time.time():codex_status=codex["status"]
        elif execution_mode(self.s)=="AUTO_HYBRID" and codex.get("status") in ("WAITING_FOR_QUOTA","ERROR"):
            codex_status="PROBE_DUE"
        else:
            codex_status="AVAILABLE"
            if codex.get("status")!="AVAILABLE":set_capability(self.s,"CODEX","AVAILABLE");self.s.release_codex_waits()
        if budget.get("state") in ("DRAIN","QUOTA_BLOCKED","UNKNOWN") and codex_status in ("AVAILABLE","PROBE_DUE"):
            codex_status="BUDGET_"+budget["state"]
        raw=self.cfg.get("local_ai_command") or []
        cmd=shlex.split(raw) if isinstance(raw,str) else list(raw)
        local="AVAILABLE" if cmd and shutil.which(str(cmd[0])) else "NOT_INSTALLED"
        if execution_mode(self.s)=="AUTO_HYBRID" and (self.cfg.get("local_ai_model")!="qwen2.5-coder:7b" or (cmd and Path(str(cmd[0])).name=="ollama" and "qwen2.5-coder:7b" not in cmd)):local="MODEL_MISMATCH"
        # AVAILABLE means executable found; successful task execution is a
        # separate evidence dimension, not an assumption.
        old=capability_status(self.s,"LOCAL_AI")
        extras={"runtime":str(cmd[0]) if cmd else None,"model":self.cfg.get("local_ai_model"),
                "availability_evidence":"EXECUTABLE_FOUND_ONLY" if local=="AVAILABLE" else "NO_EXECUTABLE",
                "semantic_verification":self.s.meta("local_ai.semantic_verification") or "UNKNOWN"}
        if old.get("status")!=local or any(old.get(k)!=v for k,v in extras.items()):
            set_capability(self.s,"LOCAL_AI",local,**extras)
        effective_codex="DISABLED_BY_USER" if execution_mode(self.s)=="LOCAL_ONLY" else codex_status
        return {"CODEX":effective_codex,"CODEX_ACTUAL":codex_status,"LOCAL_AI":local,"SHELL":"AVAILABLE","TESTS":"AVAILABLE","TYPECHECK":"AVAILABLE","BUILD":"AVAILABLE","FFMPEG":"AVAILABLE" if shutil.which("ffmpeg") else "UNAVAILABLE","MEDIA":"AVAILABLE","HASHING":"AVAILABLE","METADATA":"AVAILABLE","ANALYTICS":"AVAILABLE","METRICS":"AVAILABLE","SYNC":"AVAILABLE","RECONCILIATION":"AVAILABLE","PUBLISHER_PREP":"AVAILABLE","QUEUE_MAINTENANCE":"AVAILABLE","ROADMAP":"AVAILABLE","HEALTH":"AVAILABLE","GIT":"AVAILABLE","NETWORK":"AVAILABLE"}
    def require_codex(self):
        mode=execution_mode(self.s)
        if mode=="LOCAL_ONLY":raise RuntimeError("Codex process blocked by LOCAL_ONLY")
        if mode=="AUTO_HYBRID" and self.capabilities()["CODEX"] not in ("AVAILABLE","PROBE_DUE"):
            raise RuntimeError("Codex process blocked by durable cooldown")
    def scheduler_policy(self):
        policy=dict(self.mission.get("schedulerPolicy") or {})
        try:budget=json.loads(self.s.meta("codex.budget") or "null")
        except Exception:budget=None
        if isinstance(budget,dict):policy["_codexBudget"]=budget
        policy["_codexBudgetPolicy"]=self.cfg.get("codex_budget_policy",{})
        return policy
    def reconcile_integrations(self):
        repo=Path(self.cfg["repo_path"])
        head=subprocess.run(["git","rev-parse","HEAD"],cwd=repo,text=True,capture_output=True,check=True).stdout.strip()
        def is_ancestor(candidate,current):
            return subprocess.run(["git","merge-base","--is-ancestor",candidate,current],cwd=repo,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
        return reconcile_registry_outcomes(self.s,self.mission,head,is_ancestor)
    def park_codex(self,j,out,state="WAITING_FOR_CODEX"):
        reason="quota" if quota(out) else "transport"
        exhausted=reason=="transport" and execution_mode(self.s)!="AUTO_HYBRID" and int(j.get("attempts",0))>=int(self.cfg.get("max_codex_transport_attempts",3))
        prior=capability_status(self.s,"CODEX")
        failures=(int(prior.get("quota_failures",0))+1) if reason=="quota" else 0
        transport_failures=(int(prior.get("transport_failures",0))+1) if reason=="transport" else 0
        cooldown=min(86400,int(self.cfg["codex_retry_seconds"])*2**min(failures-1,8)) if reason=="quota" else min(3600,int(self.cfg["codex_retry_seconds"])*2**min(transport_failures-1,5))
        retry=None if exhausted else time.time()+cooldown
        set_capability(self.s,"CODEX","WAITING_FOR_QUOTA" if reason=="quota" else "ERROR",retry_at=retry or 0,reason=reason,manual_hold=exhausted,quota_failures=failures,transport_failures=transport_failures)
        self.s.event(j["id"],"CODEX_COOLDOWN",reason,{"retry_at":retry,"quota_failures":failures,"transport_failures":transport_failures,"manual_hold":exhausted})
        self.s.state(j["id"],state,"transport retry limit reached" if exhausted else reason,retry)
    def loop(self):
        self.s.setmeta("started_at",now());self.s.setmeta("status","IDLE")
        threading.Thread(target=self.heartbeat_loop,daemon=True).start()
        while not self.stop.is_set():
            self.s.setmeta("heartbeat_at",now())
            if self.s.meta("paused")=="1":self.s.setmeta("status","PAUSED");self.stop.wait(self.cfg["loop_seconds"]);continue
            try:
                caps=self.capabilities();self.s.setmeta("capabilities",jd(caps))
                self.reconcile_integrations()
                scheduler_policy=self.scheduler_policy()
                j=self.s.pick(caps,scheduler_policy)
                if not j and self.mission:
                    replenish_backlog(self.s,self.mission,caps,scheduler_policy)
                    j=self.s.pick(caps,scheduler_policy)
                if not j:
                    self.s.setmeta("status","DEGRADED" if caps["CODEX"]!="AVAILABLE" else "IDLE")
                    self.s.stop_wait_diagnostic(caps,self.mission)
                    self.stop.wait(self.cfg["loop_seconds"]);continue
                self.run(j)
            except Exception as exc:
                self.s.setmeta("status","ERROR")
                self.s.event(None,"SCHEDULER_ERROR",safe_tail(exc))
                self.stop.wait(self.cfg["loop_seconds"])
    def run(self,j):
        product=job_product(j);last=self.s.meta("scheduler.last_product")
        streak=int(self.s.meta("scheduler.consecutive_product_jobs") or 0)+1 if last==product else 1
        self.s.setmeta("scheduler.last_product",product);self.s.setmeta("scheduler.consecutive_product_jobs",str(streak))
        self.current=j["id"];self.s.setmeta("current_job_id",self.current);self.s.setmeta("status","RUNNING")
        try:
            if j["state"]=="LOCAL_READY_PENDING_CODEX_REVIEW":self.codex_review_job(j)
            elif j["kind"]=="shell":self.shell_job(j)
            elif j["kind"]=="codex":self.codex_job(j)
            elif j["kind"]=="local_ai":
                # High-risk local work needs Codex, not local_ai_job, otherwise
                # it immediately raises and permanently FAILs.
                if int(j["payload"].get("risk",1))>1:self.codex_job(j)
                else:self.local_ai_job(j)
            else:self.s.state(j["id"],"HUMAN_REQUIRED","unsupported job kind")
        except Exception as e:
            msg=str(e);self.s.event(j["id"],"EXCEPTION",msg)
            retryable=any(x.lower() in msg.lower() for x in ("git fetch","could not resolve host","connection reset","connection timed out","temporary failure","network is unreachable"))
            if retryable and int(j.get("attempts",0))<5:self.s.state(j["id"],"QUEUED",msg,time.time()+60,bump=True)
            else:self.s.state(j["id"],"FAILED",msg)
        finally:
            self.current=None;self.proc=None;self.s.setmeta("current_job_id","");self.s.setmeta("heartbeat_at",now())
            pending=self.s.meta("pending_execution_mode")
            if pending in EXECUTION_MODES:
                set_execution_mode(self.s,pending);self.s.setmeta("pending_execution_mode","")
    def cmd(self,cmd,cwd,stdin=None):
        self.proc=subprocess.Popen(cmd,cwd=cwd,text=True,stdin=subprocess.PIPE if stdin is not None else None,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            out,_=self.proc.communicate(stdin,timeout=float(self.cfg.get("command_timeout_seconds",7200)))
        except subprocess.TimeoutExpired:
            os.killpg(self.proc.pid,signal.SIGKILL);out,_=self.proc.communicate();self.proc=None
            raise TimeoutError("command timed out")
        code=self.proc.returncode;self.proc=None;return code,out or ""
    def local_model_cmd(self,cmd,cwd,prompt,job_id,iteration=0):
        """Bounded Ollama stdout reader. Never use the general build/test timeout.

        A running process is not proof of model progress.  Emit elapsed-time and
        output-byte diagnostics, and fail closed on nonterminating/repetitive output.
        """
        configured=self.cfg.get("local_ai_repair_timeout_seconds" if iteration else "local_ai_timeout_seconds",300 if iteration else 480)
        deadline_seconds=max(5.0,min(1800.0,float(configured)))
        output_limit=max(65536,min(8388608,int(self.cfg.get("local_ai_max_output_bytes",1048576))))
        progress_interval=max(1.0,min(120.0,float(self.cfg.get("local_ai_progress_seconds",30))))
        started=time.monotonic()
        proc=subprocess.Popen(cmd,cwd=cwd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                              stderr=subprocess.STDOUT,start_new_session=True)
        self.proc=proc
        output=bytearray()
        selector=selectors.DefaultSelector()
        reason=None
        try:
            self.s.event(job_id,"LOCAL_AI_STARTED","model request",{"iteration":iteration,
                "deadline_seconds":deadline_seconds,"max_output_bytes":output_limit})
            prompt_bytes=str(prompt).encode("utf-8")
            written=0
            assert proc.stdout is not None
            selector.register(proc.stdout,selectors.EVENT_READ)
            if proc.stdin is not None:
                if prompt_bytes:
                    selector.register(proc.stdin,selectors.EVENT_WRITE)
                else:
                    proc.stdin.close()
            next_progress=started+progress_interval
            while selector.get_map():
                elapsed=time.monotonic()-started
                if elapsed>=deadline_seconds:
                    reason="MODEL_TIMEOUT";break
                if self.stop.is_set():
                    reason="MODEL_SUPERVISOR_STOP";break
                for key,_ in selector.select(min(1.0,max(0.0,deadline_seconds-elapsed))):
                    if key.events==selectors.EVENT_WRITE:
                        try:written+=os.write(key.fileobj.fileno(),prompt_bytes[written:written+16384])
                        except (BrokenPipeError,ConnectionResetError):written=len(prompt_bytes)
                        if written>=len(prompt_bytes):
                            selector.unregister(key.fileobj)
                            key.fileobj.close()
                        continue
                    chunk=os.read(key.fileobj.fileno(),65536)
                    if not chunk:
                        selector.unregister(key.fileobj)
                        continue
                    output.extend(chunk)
                    if len(output)>output_limit:
                        reason="MODEL_OUTPUT_LIMIT";break
                    if self._repetitive_model_output(output):
                        reason="MODEL_REPETITIVE_OUTPUT";break
                if reason:break
                current=time.monotonic()
                if current>=next_progress:
                    self.s.event(job_id,"LOCAL_AI_PROGRESS","model request in progress",
                        {"iteration":iteration,"elapsed_seconds":round(current-started,1),
                         "output_bytes":len(output),"deadline_seconds":deadline_seconds})
                    next_progress=current+progress_interval
            if reason:
                self.s.event(job_id,"LOCAL_AI_GUARD",reason,{"iteration":iteration,
                    "elapsed_seconds":round(time.monotonic()-started,1),"output_bytes":len(output)})
                raise RuntimeError("local AI bounded execution: "+reason)
            return proc.wait(timeout=5),output.decode("utf-8",errors="replace")
        finally:
            selector.close()
            if proc.poll() is None:
                try:os.killpg(proc.pid,signal.SIGTERM)
                except ProcessLookupError:pass
                try:proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try:os.killpg(proc.pid,signal.SIGKILL)
                    except ProcessLookupError:pass
                    proc.wait(timeout=5)
            if proc.stdout is not None:proc.stdout.close()
            if proc.stdin is not None and not proc.stdin.closed:proc.stdin.close()
            if self.proc is proc:self.proc=None

    @staticmethod
    def _repetitive_model_output(output):
        if len(output)<12000:return False
        sample=output[-16000:].decode("utf-8",errors="replace")
        sample=re.sub(r"\x1b\[[0-9;?]*[ -/]*[@-~]","",sample)
        compact=re.sub(r"\s+","",sample)
        for size in range(8,129):
            if len(compact)>=size*12 and compact[-size*12:]==compact[-size:]*12:
                return True
        return False
    def git(self,cwd,args):
        cmd=["git","-c","credential.helper=","-c","credential.https://github.com.helper=!gh auth git-credential",*args]
        env={**os.environ,"GIT_TERMINAL_PROMPT":"0"}
        p=subprocess.run(cmd,cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,env=env)
        if p.returncode:raise RuntimeError("git "+" ".join(args)+" failed: "+p.stdout[-3000:])
        return p.stdout.strip()
    def worktree(self,j):
        p=j["payload"];root=Path(self.cfg["repo_path"]);wtroot=Path(self.cfg["worktree_root"]);wtroot.mkdir(parents=True,exist_ok=True)
        branch=p.get("branch") or "auto/"+j["id"].lower();base=resolve_base(self.s,p,self.cfg.get("default_base_ref","main"))
        if branch in set(self.cfg["protected_branches"]):raise RuntimeError("protected branch denied: "+branch)
        wanted=wtroot/re.sub(r"[^A-Za-z0-9._-]+","-",j["id"])
        self.s.state(j["id"],"PREPARING")
        self.git(root,["worktree","prune"])

        # Reuse an already-registered supervisor worktree for this branch.
        listing=self.git(root,["worktree","list","--porcelain"]).splitlines()
        registered=[];cur={}
        for line in listing+[""]:
            if not line:
                if cur:registered.append(cur);cur={}
                continue
            k,_,v=line.partition(" ")
            if k in ("worktree","branch"):cur[k]=v
        branch_ref="refs/heads/"+branch
        for entry in registered:
            path=Path(entry.get("worktree",""))
            if entry.get("branch")==branch_ref and str(path).startswith(str(wtroot)):
                p["branch"]=branch;p["worktree_path"]=str(path);self.s.payload(j["id"],p);return path

        # Never delete an unexpected directory. Choose a fresh path instead.
        wt=wanted
        if wt.exists():
            n=2
            while (wtroot/(wanted.name+"-"+str(n))).exists():n+=1
            wt=wtroot/(wanted.name+"-"+str(n))

        exists=subprocess.run(["git","show-ref","--verify","--quiet",branch_ref],cwd=root).returncode==0
        if not exists:
            local_base=subprocess.run(["git","rev-parse","--verify","--quiet",base+"^{commit}"],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
            if local_base.returncode!=0:
                self.git(root,["fetch","origin",base])
                base="FETCH_HEAD"
            self.git(root,["worktree","add","-b",branch,str(wt),base])
        else:
            self.git(root,["worktree","add",str(wt),branch])
        p["branch"]=branch;p["worktree_path"]=str(wt);self.s.payload(j["id"],p);return wt
    def ensure_node_dependencies(self, wt, jid):
        if not (wt / "package.json").is_file():
            return
        dependency_markers=(wt/"node_modules"/".bin"/"vitest",wt/"node_modules"/"ai",wt/"node_modules"/"@ai-sdk"/"gateway")
        if all(path.exists() for path in dependency_markers):
            return
        if (wt / "package-lock.json").is_file():
            command = ["npm", "ci", "--no-audit", "--no-fund"]
        else:
            command = ["npm", "install", "--no-save",
                       "--package-lock=false", "--no-audit",
                       "--no-fund"]
        code, output = self.cmd(command, wt)
        self.s.event(jid, "DEPENDENCY_SETUP", "npm", {
            "exit": code, "tail": safe_tail(output, 1200)
        })
        if code:
            raise RuntimeError(
                "Dependency setup failed: " + safe_tail(output, 400)
            )

    def shell_job(self,j):
        self.s.state(j["id"],"TESTING",bump=True);p=j["payload"];cmd=p.get("command")
        if not cmd:raise RuntimeError("missing command")
        c=["bash","-lc",cmd] if isinstance(cmd,str) else [str(x) for x in cmd]
        code,out=self.cmd(c,Path(p.get("cwd") or self.cfg["repo_path"]));self.s.event(j["id"],"SHELL_EXIT",str(code),{"tail":out[-10000:]})
        self.s.state(j["id"],"READY" if code==0 else "FAILED",None if code==0 else "exit "+str(code))
    def codex_job(self,j):
        p=j["payload"];prompt=str(p.get("repair_prompt") or p.get("prompt","")).strip()
        if not prompt:raise RuntimeError("missing prompt")
        wt=self.worktree(j);self.s.state(j["id"],"CODING",bump=True)
        raw=p.get("codex_command") or default_codex_command()
        c=shlex.split(raw) if isinstance(raw,str) else [str(x) for x in raw]
        self.require_codex();code,out=self.cmd(c,wt,prompt);self.s.event(j["id"],"CODEX_EXIT",str(code),{"tail":safe_tail(out,12000)})
        if execution_mode(self.s)=="LOCAL_ONLY":self.s.state(j["id"],"WAITING_FOR_CODEX","LOCAL_ONLY");return
        if not codex_result_available(code,out):
            if codex_unavailable(out):self.park_codex(j,out);return
            raise RuntimeError("Codex exit "+str(code))
        set_capability(self.s,"CODEX","AVAILABLE")
        self.s.state(j["id"],"TESTING")
        self.ensure_node_dependencies(wt, j["id"])
        for raw in p.get("test_commands") or self.cfg["test_commands"]:
            code,out=self.cmd(["bash","-lc",str(raw)],wt);self.s.event(j["id"],"TEST",str(raw),{"exit":code,"tail":out[-12000:]})
            if code:
                count=int(p.get("repair_count",0))+1;p["repair_count"]=count;p["repair_prompt"]=repair_prompt(str(p.get("prompt","")),str(raw),code,out);self.s.payload(j["id"],p)
                if count<=3:self.s.state(j["id"],"QUEUED","test failed: "+str(raw),time.time()+30)
                else:self.s.state(j["id"],"FAILED","repair limit reached: "+str(raw))
                return
        p.pop("repair_prompt",None);p["repair_count"]=0;self.s.payload(j["id"],p)
        dirty=self.git(wt,["status","--porcelain"])
        self.s.state(j["id"],"CRITIC")
        self.require_codex();code,out=self.cmd(critic_command(bool(dirty),str(p.get("base_ref") or "main")),wt);self.s.event(j["id"],"CRITIC",str(code),{"tail":safe_tail(out,12000)})
        if execution_mode(self.s)=="LOCAL_ONLY":self.s.state(j["id"],"WAITING_FOR_CODEX","LOCAL_ONLY");return
        if codex_unavailable(out):self.park_codex(j,out);return
        if code or not critic_clean(out):
            count=int(p.get("repair_count",0))+1;p["repair_count"]=count;p["repair_prompt"]=repair_prompt(str(p.get("prompt","")),"critic review",code,out);self.s.payload(j["id"],p)
            if count<=3:self.s.state(j["id"],"QUEUED","critic requested repair",time.time()+30)
            else:self.s.state(j["id"],"FAILED","critic repair limit reached")
            return
        if dirty:
            self.s.state(j["id"],"CRITIC")
            self.require_codex();code,out=self.cmd(["codex","exec","review","--uncommitted"],wt);self.s.event(j["id"],"CRITIC",str(code),{"tail":safe_tail(out,12000)})
            if execution_mode(self.s)=="LOCAL_ONLY":self.s.state(j["id"],"WAITING_FOR_CODEX","LOCAL_ONLY");return
            if codex_unavailable(out):self.park_codex(j,out);return
            if code or not critic_clean(out):
                count=int(p.get("repair_count",0))+1;p["repair_count"]=count;p["repair_prompt"]=repair_prompt(str(p.get("prompt","")),"critic review",code,out);self.s.payload(j["id"],p)
                if count<=3:self.s.state(j["id"],"QUEUED","critic requested repair",time.time()+30)
                else:self.s.state(j["id"],"FAILED","critic repair limit reached")
                return
        if dirty:
            self.git(wt,["add","-A"])
            self.git(wt,["commit","-m",f"auto({j['id']}): {j['title']}"])
        p["candidate_sha"]=self.git(wt,["rev-parse","HEAD"]);self.s.payload(j["id"],p);self.s.state(j["id"],"READY")
    def local_ai_job(self,j):
        p=j["payload"]
        if int(p.get("risk",1))>1:raise RuntimeError("local AI authority denied for risk above 1")
        wt=self.worktree(j);self.s.state(j["id"],"CODING",bump=True)
        raw=self.cfg.get("local_ai_command") or [];cmd=prepare_command(shlex.split(raw) if isinstance(raw,str) else [str(x) for x in raw])
        if not cmd:raise RuntimeError("local AI is not configured")
        if p.get("allowed_files"):
            self.ensure_node_dependencies(wt,j["id"])
            max_repairs=max(0,min(int(p.get("max_repairs",1)),2));evidence=[];repair_context=None;seen_fingerprints=set()
            for iteration in range(max_repairs+1):
                task={**p,"repair_context":repair_context,"previous_attempts":[{"iteration":x["iteration"],"response_sha256":x["response_sha256"],"diff_sha256":x.get("diff_sha256"),"failure_kind":x.get("failure",{}).get("kind")} for x in evidence]}
                prompt=build_prompt(task,wt);started=time.time()
                try:
                    code,out=self.local_model_cmd(cmd,wt,prompt,j["id"],iteration)
                except (RuntimeError,ValueError) as exc:
                    # Model limits or malformed runtime configuration must not
                    # trigger another unbounded repair of the same failed call.
                    failure={"kind":"MODEL_RUNTIME","command":"local model execution guard",
                             "exit":1,"output":safe_tail(str(exc),500)}
                    attempt={"iteration":iteration,"failure":failure,"checks":[]}
                    evidence.append(attempt);p["local_evidence"]=evidence;self.s.payload(j["id"],p)
                    self.s.event(j["id"],"LOCAL_ATTEMPT","model execution aborted",attempt)
                    self.s.state(j["id"],"FAILED",safe_tail(str(exc),500));return
                self.s.event(j["id"],"LOCAL_AI_EXIT",str(code),{"iteration":iteration,"duration_seconds":round(time.time()-started,2),"tail":safe_tail(out,1200)})
                if code:raise RuntimeError("local AI exit "+str(code)+": "+safe_tail(out,650))
                attempt={"iteration":iteration,"response_sha256":diff_fingerprint(out),"checks":[]}
                try:apply_edits(parse_response(out),task,wt)
                except LocalCodingError as exc:
                    failure={"kind":"MODEL_RESPONSE","command":"local model response parser","exit":1,"output":str(exc)}
                    attempt["failure"]=failure;evidence.append(attempt);repair_context=failure
                    self.s.event(j["id"],"LOCAL_ATTEMPT","invalid response",attempt)
                    if iteration>=max_repairs:p["local_evidence"]=evidence;self.s.payload(j["id"],p);self.s.state(j["id"],"FAILED","local QA repair limit reached");return
                    continue
                changed=self.git(wt,["diff","--name-only"]).splitlines();validate_changed_paths(changed,p["allowed_files"])
                contract_failure=None
                try:validate_required_changes(changed,p.get("required_changed_files",[]))
                except LocalCodingError as exc:contract_failure={"command":"candidate evidence contract","exit":1,"output":str(exc)}
                diff=self.git(wt,["diff","--no-ext-diff"]);validate_test_integrity(diff)
                fingerprint=diff_fingerprint(diff);attempt.update({"diff_sha256":fingerprint,"changed_files":changed,"diff_tail":safe_tail(diff,8000)})
                if fingerprint in seen_fingerprints:
                    attempt["failure"]={"kind":"REPEATED_PATCH","command":"candidate diff fingerprint","exit":1,"output":"local model repeated an identical candidate patch"};evidence.append(attempt)
                    p["local_evidence"]=evidence;self.s.payload(j["id"],p);self.s.state(j["id"],"FAILED","local model repeated identical repair");return
                seen_fingerprints.add(fingerprint)
                checks=[];failed=contract_failure
                for raw_test in ([] if failed else order_checks(p.get("test_commands") or self.cfg["test_commands"],changed)):
                    c,o=self.cmd(["bash","-lc",str(raw_test)],wt);checks.append({"command":str(raw_test),"exit":c,"tail":safe_tail(o,3000)})
                    self.s.event(j["id"],"LOCAL_QA",str(raw_test),checks[-1])
                    if c:failed={"command":str(raw_test),"exit":c,"output":safe_tail(o,6000)};break
                if not failed:
                    c,o=self.cmd(["git","diff","--check"],wt);failed=None if c==0 else {"command":"git diff --check","exit":c,"output":safe_tail(o,6000)}
                attempt["checks"]=checks
                if failed:
                    repair_context=build_repair_context(failed,wt,p["allowed_files"]);attempt["failure"]=repair_context
                evidence.append(attempt);self.s.event(j["id"],"LOCAL_ATTEMPT","verified" if not failed else "repair required",attempt)
                if not failed:break
                if repair_context["kind"]=="ENVIRONMENT":p["local_evidence"]=evidence;self.s.payload(j["id"],p);self.s.state(j["id"],"FAILED","local QA environment failure");return
                if iteration>=max_repairs:p["local_evidence"]=evidence;self.s.payload(j["id"],p);self.s.state(j["id"],"FAILED","local QA repair limit reached");return
            dirty=self.git(wt,["status","--porcelain"])
            if not dirty:self.s.state(j["id"],"FAILED","local model produced no diff");return
            self.git(wt,["add","-A"]);self.git(wt,["commit","-m",f"auto-local({j['id']}): {j['title']}"])
            p["executor_used"]="LOCAL_AI";p["candidate_sha"]=self.git(wt,["rev-parse","HEAD"]);p["changed_files"]=changed;p["local_evidence"]=evidence;p["local_model"]=self.cfg.get("local_ai_model");self.s.payload(j["id"],p)
            record_local_ai_success(self.s,j["id"]);self.s.state(j["id"],"LOCAL_VERIFIED");return
        prompt=("BOUNDED LOCAL TASK. Never access secrets, production, main, publishing, auth, or privacy architecture. "+str(p.get("prompt","")))[:6000]
        code,out=self.local_model_cmd(cmd,wt,prompt,j["id"]);self.s.event(j["id"],"LOCAL_AI_EXIT",str(code),{"tail":safe_tail(out,3000)})
        if code:
            raise RuntimeError("local AI exit "+str(code)+": "+safe_tail(out,650))
        target=Path(p.get("output_path") or ("artifacts/local-ai/"+j["id"]+".md"))
        if target.is_absolute() or ".." in target.parts:raise RuntimeError("unsafe local AI output path")
        target=wt/target;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out.strip()+"\n")
        self.s.state(j["id"],"TESTING")
        self.ensure_node_dependencies(wt, j["id"])
        for raw_test in p.get("test_commands") or self.cfg["test_commands"]:
            code,out=self.cmd(["bash","-lc",str(raw_test)],wt);self.s.event(j["id"],"TEST",str(raw_test),{"exit":code,"tail":out[-12000:]})
            if code:raise RuntimeError("local AI verification failed: "+str(raw_test))
        dirty=self.git(wt,["status","--porcelain"])
        if dirty:self.git(wt,["add","-A"]);self.git(wt,["commit","-m",f"auto-local({j['id']}): {j['title']}"])
        p["executor_used"]="LOCAL_AI";p["candidate_sha"]=self.git(wt,["rev-parse","HEAD"]);self.s.payload(j["id"],p)
        self.s.setmeta("local_ai.last_success_at",now())
        self.s.state(j["id"],"LOCAL_READY_PENDING_CODEX_REVIEW")
    def codex_review_job(self,j):
        p=j["payload"];wt=Path(p["worktree_path"]);base=resolve_base(self.s,p,self.cfg.get("default_base_ref","main"));self.s.state(j["id"],"CRITIC")
        self.require_codex();code,out=self.cmd(["codex","exec","review","--base",base],wt);self.s.event(j["id"],"CODEX_REVIEW",str(code),{"tail":safe_tail(out,12000)})
        if execution_mode(self.s)=="LOCAL_ONLY":self.s.state(j["id"],"LOCAL_READY_PENDING_CODEX_REVIEW","LOCAL_ONLY");return
        if codex_unavailable(out):
            self.park_codex(j,out,"LOCAL_READY_PENDING_CODEX_REVIEW");return
        if code or not critic_clean(out):self.s.state(j["id"],"FAILED","Codex review rejected local candidate");return
        set_capability(self.s,"CODEX","AVAILABLE");self.s.state(j["id"],"READY")
    def stop_current(self,cancel=True):
        if not self.proc or self.proc.poll() is not None:return False
        self.proc.terminate()
        try:self.proc.wait(10)
        except subprocess.TimeoutExpired:self.proc.kill()
        if cancel and self.current:self.s.state(self.current,"CANCELLED","stopped from control center")
        return True
    def request_execution_mode(self,mode,active_policy="after_current"):
        if mode not in EXECUTION_MODES:raise ValueError("invalid execution mode")
        current=next((j for j in self.s.jobs(10000) if j["id"]==self.current),None)
        active_codex=bool(current and job_executor(current)=="CODEX" and self.proc and self.proc.poll() is None)
        if mode=="LOCAL_ONLY" and active_codex and active_policy=="after_current":
            self.s.setmeta("pending_execution_mode",mode)
            self.s.event(None,"EXECUTION_MODE_PENDING",mode,{"current_job_id":self.current})
            return "PENDING_AFTER_CURRENT"
        set_execution_mode(self.s,mode);self.s.setmeta("pending_execution_mode","")
        if mode=="LOCAL_ONLY" and active_codex and active_policy=="stop_active":
            self.stop_current(False)
            return "ACTIVE_CODEX_STOP_REQUESTED"
        return "APPLIED"

HTML="""<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Life OS Supervisor</title><style>body{font-family:-apple-system,sans-serif;background:#0b0c10;color:#eef2f7;margin:0;padding:18px}main{max-width:900px;margin:auto}.c{background:#151821;border:1px solid #2a3040;border-radius:16px;padding:16px;margin:12px 0}.row{display:flex;gap:8px;flex-wrap:wrap}.p{background:#252b38;border-radius:999px;padding:6px 10px}.meta{color:#aeb8c8;font-size:13px}button,input{padding:10px;border-radius:10px;border:0}.mode{background:#252b38;color:#eef2f7}.mode.active{background:#25784a;box-shadow:0 0 0 2px #55d98b inset}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #2a3040;text-align:left}pre{white-space:pre-wrap}</style><main><h1>Autonomous Development</h1><div class=c><strong>Режим исполнения</strong><div class=row style='margin-top:10px'><button id=localmode class=mode onclick="mode('LOCAL_ONLY')">Локально · без Codex</button><button id=codexmode class=mode onclick="mode('CODEX_ALLOWED')">Codex разрешён</button><button id=automode class=mode onclick="mode('AUTO_HYBRID')">Авто: Codex ↔ локальная Qwen</button></div><p id=modeinfo class=meta>Loading mode…</p></div><div class=row><span id=u class=meta>Updated: —</span><span id=z class=meta></span></div><div id=s class=c>Loading</div><div class=c><div class=row><input id=t type=password placeholder='Control token'><button onclick=a('pause')>Pause</button><button onclick=a('resume')>Resume</button><button onclick=a('retry')>Retry</button><button onclick=a('stop')>Stop job</button></div></div><div class=c><h2>Queue</h2><div id=q></div></div><div class=c><h2>Events</h2><div id=tz class=meta></div><pre id=e></pre></div></main><script>
const POLL_MS=4000,MAX_BACKOFF_MS=20000;let timer=null,refreshing=false,failures=0;
let currentSnapshot=null;
t.value=localStorage.st||'';
const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||'Local';
function offset(){let n=-new Date().getTimezoneOffset(),sign=n>=0?'+':'-',h=Math.floor(Math.abs(n)/60),m=Math.abs(n)%60;return 'UTC'+sign+h+(m?':'+String(m).padStart(2,'0'):'')}
function localTime(v){let d=new Date(v);if(Number.isNaN(d.getTime()))return v;let p=new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d),x=Object.fromEntries(p.map(i=>[i.type,i.value]));return x.day+'.'+x.month+'.'+x.year+' '+x.hour+':'+x.minute+':'+x.second}
function clock(d){let p=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(d),x=Object.fromEntries(p.map(i=>[i.type,i.value]));return x.hour+':'+x.minute+':'+x.second}
z.textContent='Time zone: '+zone+' ('+offset()+')';tz.textContent=z.textContent;
async function g(url){let r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(url+' '+r.status);return r.json()}
async function a(x){localStorage.st=t.value;let r=await fetch('/api/control',{method:'POST',headers:{'content-type':'application/json','x-supervisor-token':t.value},body:JSON.stringify({action:x})});alert((await r.json()).message);immediate()}
async function mode(value){localStorage.st=t.value;let active=value==='LOCAL_ONLY'&&currentSnapshot?.current_executor==='CODEX',pending_mode=active?(confirm('Codex выполняет задачу. OK — остановить безопасно сейчас; Отмена — применить после завершения.')?'stop_active':'after_current'):'after_current';let r=await fetch('/api/control',{method:'POST',headers:{'content-type':'application/json','x-supervisor-token':t.value},body:JSON.stringify({action:'set_execution_mode',mode:value,pending_mode})});let x=await r.json();alert(x.message);immediate()}
function render(s,j,ev){currentSnapshot=s;let cur=j.jobs.find(x=>x.id===s.current_job_id),local=s.execution_mode==='LOCAL_ONLY';localmode.classList.toggle('active',local);codexmode.classList.toggle('active',s.execution_mode==='CODEX_ALLOWED');automode.classList.toggle('active',s.execution_mode==='AUTO_HYBRID');modeinfo.textContent='Активен: '+s.execution_mode+' · Codex: '+(s.capabilities.CODEX_ACTUAL||s.capabilities.CODEX)+' · Local: '+(s.local_ai_proof?.model||'не настроена')+(s.pending_execution_mode?' · ожидает: '+s.pending_execution_mode:'')+(s.codex_cooldown?.retry_at?' · Codex retry: '+localTime(new Date(s.codex_cooldown.retry_at*1000).toISOString()):'');document.getElementById('s').innerHTML='<div class=row><span class=p>Supervisor '+s.status+'</span><span class=p>Codex '+s.capabilities.CODEX+'</span><span class=p>Local AI '+s.capabilities.LOCAL_AI+'</span><span class=p>Deterministic AVAILABLE</span><span class=p>Heartbeat '+s.heartbeat_age_seconds+'s</span></div><p>Current: '+(cur?cur.id+' / '+cur.product+' / '+s.current_executor+' / '+cur.state:'—')+'</p><p>Idle reason: '+(s.idle_reason?s.idle_reason.reason:'—')+'</p><p>Blocked: '+Object.entries(s.queue.blocked_reasons||{}).map(([a,b])=>a+'='+b).join(', ')+'</p><p>Runnable '+s.queue.runnable+' · Waiting Codex '+s.queue.waiting_codex+' · Human '+s.queue.waiting_human+' · Ready '+s.queue.ready+'</p><p>Last ready: '+(s.last_ready?s.last_ready.id+' '+(s.last_ready.payload.candidate_sha||''):'—')+'</p>';document.getElementById('q').innerHTML='<table><tr><th>ID</th><th>Product</th><th>Executor</th><th>State</th></tr>'+j.jobs.map(x=>'<tr><td>'+x.id+'</td><td>'+x.product+'</td><td>'+x.executor+'</td><td>'+x.state+'</td></tr>').join('')+'</table>';document.getElementById('e').textContent=ev.events.map(x=>localTime(x.created_at)+' '+(x.job_id||'-')+' '+x.type+': '+x.msg).join('\\n');u.textContent='Updated: '+clock(new Date())}
function schedule(ms=POLL_MS){if(timer!==null)clearTimeout(timer);timer=setTimeout(refresh,ms)}
async function refresh(){if(refreshing)return;refreshing=true;try{let [s,j,ev]=await Promise.all([g('/api/status'),g('/api/jobs'),g('/api/events')]);render(s,j,ev);failures=0}catch(error){failures=Math.min(failures+1,3);u.textContent='Update retrying…'}finally{refreshing=false;schedule(Math.min(POLL_MS*Math.pow(2,failures),MAX_BACKOFF_MS))}}
function immediate(){if(refreshing)return;if(timer!==null)clearTimeout(timer);timer=null;refresh()}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)immediate()});window.addEventListener('focus',immediate);refresh();
</script>"""

class H(BaseHTTPRequestHandler):
    def log_message(self,*a):pass
    def sendj(self,x,code=200):
        b=jd(x).encode();self.send_response(code);self.send_header("content-type","application/json");self.send_header("content-length",str(len(b)));self.send_header("cache-control","no-store");self.end_headers();self.wfile.write(b)
    def do_GET(self):
        a=self.server.app
        if self.path=="/":b=HTML.encode();self.send_response(200);self.send_header("content-type","text/html;charset=utf-8");self.send_header("content-length",str(len(b)));self.end_headers();self.wfile.write(b);return
        if self.path=="/api/status":
            h=a.s.meta("heartbeat_at");age=None
            if h:
                try:age=max(0,int(time.time()-datetime.fromisoformat(h).timestamp()))
                except:pass
            try:caps=json.loads(a.s.meta("capabilities") or "{}")
            except:caps={}
            current=next((x for x in a.s.jobs() if x["id"]==(a.s.meta("current_job_id") or "")),None)
            o=a.s.overview();self.sendj({"status":a.s.meta("status") or "UNKNOWN","heartbeat_age_seconds":age,"paused":a.s.meta("paused")=="1","execution_mode":execution_mode(a.s),"pending_execution_mode":a.s.meta("pending_execution_mode") or None,"current_job_id":a.s.meta("current_job_id") or None,"current_executor":job_executor(current) if current else None,"capabilities":caps,"queue":a.s.queue_summary(caps),"idle_reason":json.loads(a.s.meta("scheduler.last_idle_reason") or "null"),"local_ai_proof":capability_status(a.s,"LOCAL_AI"),"codex_cooldown":capability_status(a.s,"CODEX"),"codex_budget":json.loads(a.s.meta("codex.budget") or "null"),**o});return
        if self.path=="/api/jobs":
            jobs=a.s.jobs()
            for job in jobs:job["product"]=job_product(job);job["executor"]="CODEX" if job["state"]=="LOCAL_READY_PENDING_CODEX_REVIEW" else job_executor(job)
            self.sendj({"jobs":jobs});return
        if self.path=="/api/events":self.sendj({"events":a.s.events()});return
        if self.path=="/api/diagnostics":
            try:caps=json.loads(a.s.meta("capabilities") or "{}")
            except:caps={}
            self.sendj({"jobs":a.s.job_diagnostics(caps),
                        "idle_reason":json.loads(a.s.meta("scheduler.last_idle_reason") or "null"),
                        "local_ai_proof":capability_status(a.s,"LOCAL_AI")});return
        self.sendj({"error":"not_found"},404)
    def do_POST(self):
        a=self.server.app
        if self.path!="/api/control":self.sendj({"error":"not_found"},404);return
        if not os.getenv("SUPERVISOR_CONTROL_TOKEN") or self.headers.get("x-supervisor-token")!=os.getenv("SUPERVISOR_CONTROL_TOKEN"):self.sendj({"message":"Invalid control token"},401);return
        try:n=int(self.headers.get("content-length","0"));x=json.loads(self.rfile.read(n) or b"{}")
        except:self.sendj({"message":"Invalid JSON"},400);return
        act=x.get("action")
        if act=="pause":a.s.setmeta("paused","1");m="Paused"
        elif act=="resume":a.s.setmeta("paused","0");m="Resumed"
        elif act=="stop":m="Stopped" if a.r.stop_current() else "No active process"
        elif act=="retry":
            j=next((x for x in a.s.jobs() if x["state"] in ("FAILED","WAITING_FOR_CODEX","CANCELLED")),None)
            if not j:self.sendj({"message":"No retryable job"},409);return
            if job_executor(j)=="CODEX" and execution_mode(a.s)=="LOCAL_ONLY":self.sendj({"message":"Codex task remains waiting in LOCAL_ONLY"},409);return
            a.s.state(j["id"],"QUEUED");m="Queued "+j["id"]
        elif act=="set_execution_mode":
            try:result=a.r.request_execution_mode(str(x.get("mode")),str(x.get("pending_mode") or "after_current"))
            except ValueError:self.sendj({"message":"Invalid execution mode"},400);return
            m="Execution mode "+result
        else:self.sendj({"message":"Unsupported action"},400);return
        self.sendj({"message":m})

class App:
    def __init__(self,cfg):
        self.cfg=cfg
        lock_path=Path(cfg["db_path"]+".instance.lock")
        lock_path.parent.mkdir(parents=True,exist_ok=True)
        self.instance_lock=open(lock_path,"a+")
        try:fcntl.flock(self.instance_lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            self.instance_lock.close()
            raise RuntimeError("Supervisor already running for this durable queue; refused second runner")
        self.s=Store(Path(cfg["db_path"]));self.r=Runner(cfg,self.s)
        self.http=ThreadingHTTPServer((cfg["bind_host"],cfg["bind_port"]),H);self.http.app=self
    def run(self):
        threading.Thread(target=self.r.loop,daemon=True).start()
        try:self.http.serve_forever(.5)
        finally:self.r.stop.set();self.r.stop_current(False);self.http.server_close()

def seed_store(store:Store,seed_path:str)->int:
    x=json.loads(Path(seed_path).read_text());items=x if isinstance(x,list) else x.get("jobs",[])
    have={j["id"] for j in store.jobs(10000)};added=0
    for i in items:
        if i.get("id") in have:continue
        store.add(i["title"],i["kind"],i.get("payload",{}),int(i.get("priority",100)),i.get("id"));added+=1
    return added

def main():
    p=argparse.ArgumentParser();p.add_argument("--config",default=os.getenv("SUPERVISOR_CONFIG","config.json"));p.add_argument("--seed");p.add_argument("--seed-only",action="store_true");a=p.parse_args()
    cp=Path(a.config).resolve();cfg=json.loads(cp.read_text());root=cp.parent
    for k in ("db_path","repo_path","worktree_root","mission_path"):
        q=Path(cfg[k]).expanduser();cfg[k]=str(q if q.is_absolute() else (root/q).resolve())
    mp=Path(cfg["mission_path"]);mission=json.loads(mp.read_text()) if mp.exists() else {}
    cfg["_mission"]=load_planner_registry(root,mission,cfg.get("planner_registry_path"))
    cfg["loop_seconds"]=max(5,int(cfg.get("loop_seconds",15)));cfg["codex_retry_seconds"]=max(300,int(cfg.get("codex_retry_seconds",1800)));cfg["command_timeout_seconds"]=max(60,int(cfg.get("command_timeout_seconds",7200)))
    if a.seed and a.seed_only:
        store=Store(Path(cfg["db_path"]))
        try:seed_store(store,a.seed)
        finally:store.c.close()
        return
    app=App(cfg)
    if a.seed:seed_store(app.s,a.seed)
    def sig(*_):threading.Thread(target=app.http.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,sig);signal.signal(signal.SIGINT,sig);app.run()
if __name__=="__main__":main()

