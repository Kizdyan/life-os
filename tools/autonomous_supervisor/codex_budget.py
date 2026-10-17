from __future__ import annotations
import json,select,subprocess,time

def _window(value):
    if not isinstance(value,dict):return None
    used=value.get("usedPercent");duration=value.get("windowDurationMins")
    if isinstance(used,bool) or not isinstance(used,(int,float)) or used<0 or used>100:return None
    if duration is not None and (isinstance(duration,bool) or not isinstance(duration,(int,float)) or duration<=0):return None
    return {"usedPercent":float(used),"remainingPercent":float(100-used),"windowDurationMins":duration,"resetsAt":value.get("resetsAt")}

def normalize_rate_limits(result,observed_at=None):
    observed=float(time.time() if observed_at is None else observed_at)
    buckets=result.get("rateLimitsByLimitId") if isinstance(result,dict) else None
    values=list(buckets.values()) if isinstance(buckets,dict) and buckets else [result.get("rateLimits",{}) if isinstance(result,dict) else {}]
    windows=[]
    for bucket in values:
        if not isinstance(bucket,dict):continue
        for name in ("primary","secondary"):
            window=_window(bucket.get(name))
            if window:windows.append(window)
    windows.sort(key=lambda x:x.get("windowDurationMins") or 0)
    short=next((x for x in windows if x.get("windowDurationMins") is not None and x["windowDurationMins"]<=1440),None)
    weekly=next((x for x in reversed(windows) if x.get("windowDurationMins") is not None and x["windowDurationMins"]>=4320),None)
    return {"source":"codex_app_server","observedAt":observed,"ordinaryUsageAllowed":result.get("ordinaryUsageAllowed") if isinstance(result,dict) else None,"short":short,"weekly":weekly}

def evaluate_budget(snapshot,policy=None,estimate=None,clock=None):
    policy=policy or {};estimate=estimate or {};clock=float(time.time() if clock is None else clock)
    if not isinstance(snapshot,dict) or snapshot.get("source")!="codex_app_server":return {"state":"UNKNOWN","reasons":["missing_snapshot"]}
    age=clock-float(snapshot.get("observedAt",0) or 0)
    if age>float(policy.get("staleAfterSeconds",600)):return {"state":"UNKNOWN","reasons":["stale_snapshot"],"ageSeconds":age}
    if snapshot.get("ordinaryUsageAllowed") is False:return {"state":"QUOTA_BLOCKED","reasons":["backend_denied"]}
    if not snapshot.get("short") or not snapshot.get("weekly"):return {"state":"UNKNOWN","reasons":["missing_window"]}
    reasons=[];caution=False
    for name,reserve_key,cost_key in (("short","shortReservePercent","shortPercent"),("weekly","weeklyReservePercent","weeklyPercent")):
        remaining=float(snapshot[name]["remainingPercent"]);reserve=float(policy.get(reserve_key,0));cost=max(0,float(estimate.get(cost_key,0) or 0));available=remaining-reserve
        if available<=0:reasons.append(name+"_reserve");continue
        if cost>available:reasons.append(name+"_task_exceeds_budget");continue
        if available-cost<=float(policy.get("cautionPercent",10)):caution=True
    if reasons:return {"state":"DRAIN","reasons":reasons}
    return {"state":"CAUTION" if caution else "NORMAL","reasons":["low_headroom"] if caution else []}

def _stdio_exchange(command,requests,timeout):
    process=subprocess.Popen(command,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,bufsize=1)
    try:
        for request in requests:
            process.stdin.write(json.dumps(request,separators=(",",":"))+"\n")
        process.stdin.flush();messages=[];deadline=time.monotonic()+timeout
        while time.monotonic()<deadline:
            ready,_,_=select.select([process.stdout],[],[],max(0,deadline-time.monotonic()))
            if not ready:break
            line=process.stdout.readline()
            if not line:break
            try:message=json.loads(line)
            except json.JSONDecodeError:continue
            messages.append(message)
            if message.get("id")==2:return messages
        raise TimeoutError("Codex app-server rate-limit read timed out")
    finally:
        process.terminate()
        try:process.wait(timeout=2)
        except subprocess.TimeoutExpired:process.kill()

def read_rate_limits(command=None,timeout=10,exchange=None):
    command=command or ["codex","app-server","--listen","stdio://"]
    requests=[
        {"id":1,"method":"initialize","params":{"clientInfo":{"name":"life_os_supervisor","title":"Life OS Supervisor","version":"2.0"}}},
        {"method":"initialized"},
        {"id":2,"method":"account/rateLimits/read","params":{}},
    ]
    messages=(exchange or _stdio_exchange)(command,requests,timeout)
    response=next((x for x in messages if x.get("id")==2),None)
    if not response or "result" not in response:raise RuntimeError("Codex app-server returned no rate-limit result")
    return response["result"]
