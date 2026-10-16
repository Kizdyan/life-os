#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,os,re,shlex,shutil,signal,sqlite3,subprocess,threading,time,uuid
from datetime import datetime,timezone
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

QUOTA=[re.compile(x,re.I) for x in ("usage limit","rate limit","quota","credits? exhausted","limit.*reset")]
CODEX_UNAVAILABLE=[re.compile(x,re.I) for x in (r"workspace routing discovery failed",r"reconnecting\.\.\.",r"please try again later",r"status\.openai\.com",r"service unavailable")]
def now(): return datetime.now(timezone.utc).isoformat()
def jd(x): return json.dumps(x,ensure_ascii=False,separators=(",",":"))
def quota(s): return any(p.search(s) for p in QUOTA)
def codex_unavailable(s): return quota(s) or any(p.search(s) for p in CODEX_UNAVAILABLE)
def default_codex_command(): return ["codex","exec","--approve-for-me","-"]
def repair_prompt(base,command,code,out): return (base+"\n\nBOUNDED REPAIR ONLY. The previous verified command failed: "+command+" (exit "+str(code)+"). Diagnose and fix only that failure, preserve the existing bounded diff, then rerun the failing command. Evidence tail:\n"+out[-3000:])[-4800:]
def critic_clean(out): return bool(re.search(r"no actionable (?:findings|regressions)|no critical issues",out,re.I))
def critic_command(dirty,base): return ["codex","exec","review","--uncommitted"] if dirty else ["codex","exec","review","--base",base]
def job_executor(job):
    kind=job.get("kind");payload=job.get("payload",{})
    if kind=="codex":return "CODEX"
    if kind=="local_ai":return "CODEX" if int(payload.get("risk",1))>=3 else "LOCAL_AI"
    return "DETERMINISTIC"
def required_capabilities(job):
    declared=job.get("payload",{}).get("requires")
    if declared:return {str(x).upper() for x in declared}
    return {"CODEX"} if job_executor(job)=="CODEX" else ({"LOCAL_AI"} if job_executor(job)=="LOCAL_AI" else {"SHELL"})
def capability_status(store,name,default="AVAILABLE"):
    raw=store.meta("capability."+name)
    if not raw:return {"status":default}
    try:return json.loads(raw)
    except:return {"status":"ERROR","reason":"invalid durable capability state"}
def set_capability(store,name,status,**extra):store.setmeta("capability."+name,jd({"status":status,**extra,"updated_at":now()}))
def capabilities_allow(job,capabilities):return all(capabilities.get(x,"UNAVAILABLE")=="AVAILABLE" for x in required_capabilities(job))
def job_product(job):
    explicit=job.get("payload",{}).get("product")
    if explicit:return explicit
    stream=job.get("payload",{}).get("workstream","")
    if stream in {"CONTENT_CONVEYOR","ARCHETYPE_BRAND","PERSONA_INTELLIGENCE","MEDIA_INTAKE","VIDEO","CAROUSEL","PHOTO","QUALITY_COURT","PUBLISHER","METRICS","LEARNING"}:return "PERSONA"
    if stream in {"TRUTH","SYNC","PRIVACY","ERIKA","CANONICAL_INTEGRATION"}:return "LIFE_OS"
    return "SHARED"
def replenish_backlog(store,mission,capabilities=None):
    items=mission.get("backlog",[]);jobs=store.jobs(10000);by_id={j["id"]:j for j in jobs};added=0
    for item in items:
        if item["id"] in by_id:continue
        store.add(item["title"],item.get("kind","codex"),item.get("payload",{}),int(item.get("priority",100)),item["id"]);added+=1
    if added:return added
    if capabilities is None:
        active={"QUEUED","PREPARING","CODING","TESTING","CRITIC","WAITING_FOR_CODEX"}
        if any(j["state"] in active for j in store.jobs(10000)):return 0
    elif store.pick(capabilities):return 0
    roadmaps=[j for j in store.jobs(10000) if j["id"].startswith("ROADMAP-")]
    if roadmaps and max(roadmaps,key=lambda j:int(j["id"].split("-")[-1]))["state"]!="READY":return 0
    continuation=mission.get("continuation")
    if not continuation:return 0
    seq=1+sum(1 for j in jobs if j["id"].startswith("ROADMAP-"));jid=f"ROADMAP-{seq:03d}"
    store.add(continuation["title"],continuation.get("kind","codex"),continuation.get("payload",{}),int(continuation.get("priority",100)),jid);return 1

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
    def pick(self,capabilities=None):
        capabilities=capabilities or {"CODEX":"AVAILABLE","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
        with self.l:rows=self.c.execute("SELECT * FROM jobs WHERE state IN ('QUEUED','WAITING_FOR_CODEX','LOCAL_READY_PENDING_CODEX_REVIEW') ORDER BY priority,created_at").fetchall()
        for r in rows:
            job=self.row(r);deps=job["payload"].get("dependencies",[])
            if job["state"]=="LOCAL_READY_PENDING_CODEX_REVIEW":required={"CODEX"}
            else:required=required_capabilities(job)
            if not all(capabilities.get(x,"UNAVAILABLE")=="AVAILABLE" for x in required):continue
            if r["not_before"] is not None and r["not_before"]>time.time():continue
            if deps:
                marks=",".join("?" for _ in deps)
                with self.l:states={x["id"]:x["state"] for x in self.c.execute(f"SELECT id,state FROM jobs WHERE id IN ({marks})",deps)}
                if not all(states.get(dep)=="READY" for dep in deps):continue
            return job
        return None
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
    def queue_summary(self,capabilities):
        jobs=self.jobs(10000);runnable=0
        for job in jobs:
            if job["state"] not in ("QUEUED","WAITING_FOR_CODEX","LOCAL_READY_PENDING_CODEX_REVIEW"):continue
            needed={"CODEX"} if job["state"]=="LOCAL_READY_PENDING_CODEX_REVIEW" else required_capabilities(job)
            if job.get("not_before") and job["not_before"]>time.time():continue
            if all(capabilities.get(x,"UNAVAILABLE")=="AVAILABLE" for x in needed):
                deps=job["payload"].get("dependencies",[]);states={x["id"]:x["state"] for x in jobs}
                if all(states.get(x)=="READY" for x in deps):runnable+=1
        return {"runnable":runnable,"waiting_codex":sum(j["state"] in ("WAITING_FOR_CODEX","LOCAL_READY_PENDING_CODEX_REVIEW") for j in jobs),"waiting_human":sum(j["state"]=="HUMAN_REQUIRED" for j in jobs),"ready":sum(j["state"]=="READY" for j in jobs)}
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
        self.cfg=cfg;self.s=store;self.mission=cfg.get("_mission",{});self.stop=threading.Event();self.proc=None;self.current=None;self.s.recover_interrupted()
    def heartbeat_loop(self):
        while not self.stop.wait(min(10,self.cfg["loop_seconds"])):
            self.s.setmeta("heartbeat_at",now())
    def capabilities(self):
        forced=os.getenv("SUPERVISOR_FORCE_CODEX_UNAVAILABLE")=="1" or bool(self.cfg.get("force_codex_unavailable",False))
        codex=capability_status(self.s,"CODEX")
        retry=float(codex.get("retry_at",0) or 0)
        if forced:
            codex_status="WAITING_FOR_QUOTA"
            if codex.get("reason")!="forced":set_capability(self.s,"CODEX","WAITING_FOR_QUOTA",retry_at=0,reason="forced")
        elif codex.get("status") in ("WAITING_FOR_QUOTA","ERROR") and retry>time.time():codex_status=codex["status"]
        else:
            codex_status="AVAILABLE"
            if codex.get("status")!="AVAILABLE":set_capability(self.s,"CODEX","AVAILABLE");self.s.release_codex_waits()
        raw=self.cfg.get("local_ai_command") or []
        cmd=shlex.split(raw) if isinstance(raw,str) else list(raw)
        local="AVAILABLE" if cmd and shutil.which(str(cmd[0])) else "NOT_INSTALLED"
        set_capability(self.s,"LOCAL_AI",local,runtime=str(cmd[0]) if cmd else None,model=self.cfg.get("local_ai_model"))
        return {"CODEX":codex_status,"LOCAL_AI":local,"SHELL":"AVAILABLE","TESTS":"AVAILABLE","TYPECHECK":"AVAILABLE","BUILD":"AVAILABLE","FFMPEG":"AVAILABLE" if shutil.which("ffmpeg") else "UNAVAILABLE","MEDIA":"AVAILABLE","HASHING":"AVAILABLE","METADATA":"AVAILABLE","ANALYTICS":"AVAILABLE","METRICS":"AVAILABLE","SYNC":"AVAILABLE","RECONCILIATION":"AVAILABLE","PUBLISHER_PREP":"AVAILABLE","QUEUE_MAINTENANCE":"AVAILABLE","ROADMAP":"AVAILABLE","HEALTH":"AVAILABLE","GIT":"AVAILABLE","NETWORK":"AVAILABLE"}
    def loop(self):
        self.s.setmeta("started_at",now());self.s.setmeta("status","IDLE")
        threading.Thread(target=self.heartbeat_loop,daemon=True).start()
        while not self.stop.is_set():
            self.s.setmeta("heartbeat_at",now())
            if self.s.meta("paused")=="1":self.s.setmeta("status","PAUSED");self.stop.wait(self.cfg["loop_seconds"]);continue
            caps=self.capabilities();self.s.setmeta("capabilities",jd(caps));j=self.s.pick(caps)
            if not j and self.mission:replenish_backlog(self.s,self.mission,caps);j=self.s.pick(caps)
            if not j:self.s.setmeta("status","DEGRADED" if caps["CODEX"]!="AVAILABLE" else "IDLE");self.stop.wait(self.cfg["loop_seconds"]);continue
            self.run(j)
    def run(self,j):
        self.current=j["id"];self.s.setmeta("current_job_id",self.current);self.s.setmeta("status","RUNNING")
        try:
            if j["state"]=="LOCAL_READY_PENDING_CODEX_REVIEW":self.codex_review_job(j)
            elif j["kind"]=="shell":self.shell_job(j)
            elif j["kind"]=="codex":self.codex_job(j)
            elif j["kind"]=="local_ai":self.local_ai_job(j)
            else:self.s.state(j["id"],"HUMAN_REQUIRED","unsupported job kind")
        except Exception as e:
            msg=str(e);self.s.event(j["id"],"EXCEPTION",msg)
            retryable=any(x.lower() in msg.lower() for x in ("git fetch","could not resolve host","connection reset","connection timed out","temporary failure","network is unreachable"))
            if retryable and int(j.get("attempts",0))<5:self.s.state(j["id"],"QUEUED",msg,time.time()+60,bump=True)
            else:self.s.state(j["id"],"FAILED",msg)
        finally:self.current=None;self.proc=None;self.s.setmeta("current_job_id","");self.s.setmeta("heartbeat_at",now())
    def cmd(self,cmd,cwd,stdin=None):
        self.proc=subprocess.Popen(cmd,cwd=cwd,text=True,stdin=subprocess.PIPE if stdin is not None else None,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
        try:
            out,_=self.proc.communicate(stdin,timeout=float(self.cfg.get("command_timeout_seconds",7200)))
        except subprocess.TimeoutExpired:
            os.killpg(self.proc.pid,signal.SIGKILL);out,_=self.proc.communicate();self.proc=None
            raise TimeoutError("command timed out")
        code=self.proc.returncode;self.proc=None;return code,out or ""
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
        code,out=self.cmd(c,wt,prompt);self.s.event(j["id"],"CODEX_EXIT",str(code),{"tail":out[-12000:]})
        if code:
            if codex_unavailable(out):
                retry=time.time()+self.cfg["codex_retry_seconds"];reason="quota" if quota(out) else "transport";set_capability(self.s,"CODEX","WAITING_FOR_QUOTA" if reason=="quota" else "ERROR",retry_at=retry,reason=reason);self.s.state(j["id"],"WAITING_FOR_CODEX",reason,retry);return
            raise RuntimeError("Codex exit "+str(code))
        set_capability(self.s,"CODEX","AVAILABLE")
        self.s.state(j["id"],"TESTING")
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
        code,out=self.cmd(critic_command(bool(dirty),str(p.get("base_ref") or "main")),wt);self.s.event(j["id"],"CRITIC",str(code),{"tail":out[-12000:]})
        if code or not critic_clean(out):
            if codex_unavailable(out):
                retry=time.time()+self.cfg["codex_retry_seconds"];reason="quota" if quota(out) else "transport";set_capability(self.s,"CODEX","WAITING_FOR_QUOTA" if reason=="quota" else "ERROR",retry_at=retry,reason=reason);self.s.state(j["id"],"WAITING_FOR_CODEX",reason,retry);return
            count=int(p.get("repair_count",0))+1;p["repair_count"]=count;p["repair_prompt"]=repair_prompt(str(p.get("prompt","")),"critic review",code,out);self.s.payload(j["id"],p)
            if count<=3:self.s.state(j["id"],"QUEUED","critic requested repair",time.time()+30)
            else:self.s.state(j["id"],"FAILED","critic repair limit reached")
            return
        if dirty:
            self.s.state(j["id"],"CRITIC")
            code,out=self.cmd(["codex","exec","review","--uncommitted"],wt);self.s.event(j["id"],"CRITIC",str(code),{"tail":out[-12000:]})
            if code or not critic_clean(out):
                if codex_unavailable(out):
                    retry=time.time()+self.cfg["codex_retry_seconds"];reason="quota" if quota(out) else "transport";set_capability(self.s,"CODEX","WAITING_FOR_QUOTA" if reason=="quota" else "ERROR",retry_at=retry,reason=reason);self.s.state(j["id"],"WAITING_FOR_CODEX",reason,retry);return
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
        raw=self.cfg.get("local_ai_command") or [];cmd=shlex.split(raw) if isinstance(raw,str) else [str(x) for x in raw]
        if not cmd:raise RuntimeError("local AI is not configured")
        prompt=("BOUNDED LOCAL TASK. Never access secrets, production, main, publishing, auth, or privacy architecture. "+str(p.get("prompt","")))[:6000]
        code,out=self.cmd(cmd,wt,prompt);self.s.event(j["id"],"LOCAL_AI_EXIT",str(code),{"tail":out[-12000:]})
        if code:raise RuntimeError("local AI exit "+str(code))
        target=Path(p.get("output_path") or ("artifacts/local-ai/"+j["id"]+".md"))
        if target.is_absolute() or ".." in target.parts:raise RuntimeError("unsafe local AI output path")
        target=wt/target;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(out.strip()+"\n")
        self.s.state(j["id"],"TESTING")
        for raw_test in p.get("test_commands") or self.cfg["test_commands"]:
            code,out=self.cmd(["bash","-lc",str(raw_test)],wt);self.s.event(j["id"],"TEST",str(raw_test),{"exit":code,"tail":out[-12000:]})
            if code:raise RuntimeError("local AI verification failed: "+str(raw_test))
        dirty=self.git(wt,["status","--porcelain"])
        if dirty:self.git(wt,["add","-A"]);self.git(wt,["commit","-m",f"auto-local({j['id']}): {j['title']}"])
        p["executor_used"]="LOCAL_AI";p["candidate_sha"]=self.git(wt,["rev-parse","HEAD"]);self.s.payload(j["id"],p);self.s.state(j["id"],"LOCAL_READY_PENDING_CODEX_REVIEW")
    def codex_review_job(self,j):
        p=j["payload"];wt=Path(p["worktree_path"]);base=resolve_base(self.s,p,self.cfg.get("default_base_ref","main"));self.s.state(j["id"],"CRITIC")
        code,out=self.cmd(["codex","exec","review","--base",base],wt);self.s.event(j["id"],"CODEX_REVIEW",str(code),{"tail":out[-12000:]})
        if code and codex_unavailable(out):
            retry=time.time()+self.cfg["codex_retry_seconds"];reason="quota" if quota(out) else "transport";set_capability(self.s,"CODEX","WAITING_FOR_QUOTA" if reason=="quota" else "ERROR",retry_at=retry,reason=reason);self.s.state(j["id"],"LOCAL_READY_PENDING_CODEX_REVIEW",reason,retry);return
        if code or not critic_clean(out):self.s.state(j["id"],"FAILED","Codex review rejected local candidate");return
        set_capability(self.s,"CODEX","AVAILABLE");self.s.state(j["id"],"READY")
    def stop_current(self,cancel=True):
        if not self.proc or self.proc.poll() is not None:return False
        self.proc.terminate()
        try:self.proc.wait(10)
        except subprocess.TimeoutExpired:self.proc.kill()
        if cancel and self.current:self.s.state(self.current,"CANCELLED","stopped from control center")
        return True

HTML="""<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Life OS Supervisor</title><style>body{font-family:-apple-system,sans-serif;background:#0b0c10;color:#eef2f7;margin:0;padding:18px}main{max-width:900px;margin:auto}.c{background:#151821;border:1px solid #2a3040;border-radius:16px;padding:16px;margin:12px 0}.row{display:flex;gap:8px;flex-wrap:wrap}.p{background:#252b38;border-radius:999px;padding:6px 10px}button,input{padding:10px;border-radius:10px;border:0}table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid #2a3040;text-align:left}</style><main><h1>Autonomous Development</h1><div id=s class=c>Loading</div><div class=c><div class=row><input id=t type=password placeholder='Control token'><button onclick=a('pause')>Pause</button><button onclick=a('resume')>Resume</button><button onclick=a('retry')>Retry</button><button onclick=a('stop')>Stop job</button></div></div><div class=c><h2>Queue</h2><div id=q></div></div><div class=c><h2>Events</h2><pre id=e></pre></div></main><script>t.value=localStorage.st||'';async function g(u){return(await fetch(u,{cache:'no-store'})).json()}async function a(x){localStorage.st=t.value;let r=await fetch('/api/control',{method:'POST',headers:{'content-type':'application/json','x-supervisor-token':t.value},body:JSON.stringify({action:x})});alert((await r.json()).message);l()}async function l(){let s=await g('/api/status'),j=await g('/api/jobs'),ev=await g('/api/events'),cur=j.jobs.find(x=>x.id===s.current_job_id);document.getElementById('s').innerHTML='<div class=row><span class=p>Supervisor '+s.status+'</span><span class=p>Codex '+s.capabilities.CODEX+'</span><span class=p>Local AI '+s.capabilities.LOCAL_AI+'</span><span class=p>Deterministic AVAILABLE</span><span class=p>Heartbeat '+s.heartbeat_age_seconds+'s</span></div><p>Current: '+(cur?cur.id+' / '+cur.product+' / '+s.current_executor+' / '+cur.state:'—')+'</p><p>Runnable '+s.queue.runnable+' · Waiting Codex '+s.queue.waiting_codex+' · Human '+s.queue.waiting_human+' · Ready '+s.queue.ready+'</p><p>Last ready: '+(s.last_ready?s.last_ready.id+' '+(s.last_ready.payload.candidate_sha||''):'—')+'</p>';document.getElementById('q').innerHTML='<table><tr><th>ID</th><th>Product</th><th>Executor</th><th>State</th></tr>'+j.jobs.map(x=>'<tr><td>'+x.id+'</td><td>'+x.product+'</td><td>'+x.executor+'</td><td>'+x.state+'</td></tr>').join('')+'</table>';document.getElementById('e').textContent=ev.events.map(x=>x.created_at+' '+(x.job_id||'-')+' '+x.type+': '+x.msg).join('\\n')}l();setInterval(l,5000)</script>"""

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
            o=a.s.overview();self.sendj({"status":a.s.meta("status") or "UNKNOWN","heartbeat_age_seconds":age,"paused":a.s.meta("paused")=="1","current_job_id":a.s.meta("current_job_id") or None,"current_executor":job_executor(current) if current else None,"capabilities":caps,"queue":a.s.queue_summary(caps),**o});return
        if self.path=="/api/jobs":
            jobs=a.s.jobs()
            for job in jobs:job["product"]=job_product(job);job["executor"]="CODEX" if job["state"]=="LOCAL_READY_PENDING_CODEX_REVIEW" else job_executor(job)
            self.sendj({"jobs":jobs});return
        if self.path=="/api/events":self.sendj({"events":a.s.events()});return
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
            a.s.state(j["id"],"QUEUED");m="Queued "+j["id"]
        else:self.sendj({"message":"Unsupported action"},400);return
        self.sendj({"message":m})

class App:
    def __init__(self,cfg):
        self.cfg=cfg;self.s=Store(Path(cfg["db_path"]));self.r=Runner(cfg,self.s);self.http=ThreadingHTTPServer((cfg["bind_host"],cfg["bind_port"]),H);self.http.app=self
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
    mp=Path(cfg["mission_path"]);cfg["_mission"]=json.loads(mp.read_text()) if mp.exists() else {}
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

