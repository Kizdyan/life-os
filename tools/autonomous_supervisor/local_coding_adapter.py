from __future__ import annotations
import hashlib,json,re
from pathlib import Path

class LocalCodingError(RuntimeError):pass

def classify_failure(command:str,exit_code:int,output:str)->str:
    lower=output.lower()
    if exit_code in (126,127) or any(x in lower for x in ("not found","no such file or directory","cannot find module")):return "ENVIRONMENT"
    if "typecheck" in command.lower() or re.search(r"error TS\d+",output):return "TYPECHECK"
    if "test" in command.lower() or "failed tests" in lower:return "TEST"
    if "diff --check" in command:return "DIFF"
    return "COMMAND"

def build_repair_context(failure:dict,root:Path,allowed_files:list[str])->dict:
    output=str(failure.get("output") or failure.get("tail") or "")[-6000:]
    locations=[];seen=set();allowed=set(allowed_files)
    pattern=r"(?P<path>[A-Za-z0-9_./\\-]+\.(?:ts|tsx|js|jsx|py))(?::|\()(?P<line>\d+)(?::|,)(?P<column>\d+)\)?"
    for match in re.finditer(pattern,output):
        rel=match.group("path").replace("\\","/");line=int(match.group("line"));key=(rel,line)
        if key in seen or rel not in allowed:continue
        seen.add(key);p=(root/rel).resolve()
        if root.resolve() not in p.parents or not p.is_file():continue
        lines=p.read_text(errors="replace").splitlines();lo=max(1,line-2);hi=min(len(lines),line+2)
        locations.append({"path":rel,"line":line,"column":int(match.group("column")),"snippet":"\n".join(f"{n}: {lines[n-1]}" for n in range(lo,hi+1))})
    return {"kind":classify_failure(str(failure.get("command","")),int(failure.get("exit",1)),output),"command":str(failure.get("command","")),"exit":int(failure.get("exit",1)),"output":output,"locations":locations,"instruction":"Repair only the diagnosed failure. Preserve tests and assertions. Do not add a test that merely restates this instruction."}

def diff_fingerprint(diff:str)->str:return hashlib.sha256(diff.encode()).hexdigest()

def validate_test_integrity(diff:str):
    removed=[]
    for line in diff.splitlines():
        if line.startswith("---"):continue
        if line.startswith("-") and re.search(r"\b(?:it|test)\s*\(|\bexpect\s*\(",line[1:]):removed.append(line[1:].strip())
    if removed:raise LocalCodingError("local candidate removed or rewrote existing tests/assertions")

def validate_required_changes(changed_files:list[str],required_files:list[str]):
    changed={path.replace("\\","/") for path in changed_files}
    missing=[path for path in required_files if path.replace("\\","/") not in changed]
    if missing:raise LocalCodingError("local candidate did not change required evidence files: "+", ".join(missing))

def order_checks(commands:list[str],changed_files:list[str])->list[str]:
    """Run static diagnostics before runtime tests when a test file changed."""
    if not any(re.search(r"(?:^|/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|jsx|py)$",path.replace("\\","/")) for path in changed_files):
        return list(commands)
    static=[command for command in commands if "typecheck" in command.lower()]
    return static+[command for command in commands if command not in static]

def prepare_command(command:list[str])->list[str]:
    prepared=list(command)
    if prepared and Path(prepared[0]).name.lower() in ("ollama","ollama.exe"):
        if "--format" not in prepared:prepared.extend(["--format","json"])
        if "--hidethinking" not in prepared:prepared.append("--hidethinking")
        if "--nowordwrap" not in prepared:prepared.append("--nowordwrap")
    return prepared

def parse_response(raw:str)->dict:
    # `ollama run` may emit cursor visibility/progress control sequences even
    # when stdout is captured. They can occur between individual JSON tokens.
    clean=re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]","",raw)
    fenced=re.search(r"```(?:json)?\s*(\{.*\})\s*```",clean,flags=re.I|re.S)
    text=fenced.group(1) if fenced else re.sub(r"^```(?:json)?\s*|\s*```$","",clean.strip(),flags=re.I)
    if not fenced and "{" in text and "}" in text:text=text[text.index("{"):text.rindex("}")+1]
    try:data=json.loads(text)
    except Exception as exc:raise LocalCodingError("local model returned invalid JSON") from exc
    if not isinstance(data,dict) or not isinstance(data.get("edits"),list):raise LocalCodingError("local model response has no edits")
    return data

def build_prompt(task:dict,root:Path)->str:
    allowed=[str(x) for x in task.get("allowed_files",[])]
    if not allowed:raise LocalCodingError("local coding task has no allowed_files")
    files=[]
    for rel in allowed:
        p=(root/rel).resolve()
        if root.resolve() not in p.parents or not p.is_file() or p.is_symlink():raise LocalCodingError("unsafe or missing context file: "+rel)
        text=p.read_text(errors="replace")
        if len(text)>30000:raise LocalCodingError("context file too large: "+rel)
        files.append({"path":rel,"content":text})
    request={"goal":task.get("goal"),"acceptance":task.get("acceptance",[]),"allowed_files":allowed,"files":files,"repair":task.get("repair_context"),"previous_attempts":task.get("previous_attempts",[])}
    return "You are a bounded local coding worker. Return ONLY valid JSON: {\"plan\":string,\"edits\":[{\"path\":string,\"content\":string}],\"risks\":[string]}. Edit only allowed_files. Preserve behavior outside the goal. Never delete or weaken existing tests. When repair is present, use its exact output and source locations, change only the failing section, and do not repeat a previous patch. Do not use shell, secrets, network, markdown fences, or placeholders.\n"+json.dumps(request,ensure_ascii=False)

def apply_edits(data:dict,task:dict,root:Path)->list[str]:
    allowed=set(map(str,task.get("allowed_files",[])));changed=[];total=0
    for edit in data["edits"]:
        rel=str(edit.get("path",""));content=edit.get("content")
        if rel not in allowed or not isinstance(content,str):raise LocalCodingError("model attempted an unauthorized edit")
        p=(root/rel).resolve()
        if root.resolve() not in p.parents or p.is_symlink():raise LocalCodingError("unsafe edit path")
        total+=len(content.encode())
        if total>100000:raise LocalCodingError("local edit budget exceeded")
        p.write_text(content);changed.append(rel)
    if not changed:raise LocalCodingError("local model produced no code change")
    return changed

def validate_changed_paths(changed:list[str],allowed:list[str]):
    extra=sorted(set(changed)-set(allowed))
    if extra:raise LocalCodingError("unauthorized changed paths: "+",".join(extra))
