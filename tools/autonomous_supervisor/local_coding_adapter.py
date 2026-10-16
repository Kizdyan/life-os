from __future__ import annotations
import json,re
from pathlib import Path

class LocalCodingError(RuntimeError):pass

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
    request={"goal":task.get("goal"),"acceptance":task.get("acceptance",[]),"allowed_files":allowed,"files":files}
    return "You are a bounded local coding worker. Return ONLY valid JSON: {\"plan\":string,\"edits\":[{\"path\":string,\"content\":string}],\"risks\":[string]}. Edit only allowed_files. Preserve behavior outside the goal. Do not use shell, secrets, network, markdown fences, or placeholders.\n"+json.dumps(request,ensure_ascii=False)

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
