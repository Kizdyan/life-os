/**
 * Authenticated requests to the local Persona Media Worker.
 * The per-process token changes when the Worker restarts.
 * A 401 has no side effect on the Worker: refresh the token and replay
 * the same request once (all callers pass repeatable JSON or File bodies).
 * Never retry other failures, which could represent completed mutations.
 */
export async function fetchQuickWorkerWithReconnect(
 url:string,
 init:RequestInit,
 getToken:()=>Promise<string>,
 renewToken:()=>Promise<string>,
 transport:typeof fetch=fetch
):Promise<Response>{
 const send=async(key:string)=>{
  const headers=new Headers(init.headers);
  headers.set('X-Persona-Worker-Token',key);
  return transport(url,{...init,headers});
 };
 const first=await send(await getToken());
 if(first.status!==401)return first;
 // A restart invalidated the cached token. Never repeat a write after
 // a successful response or a non-authentication failure.
 return send(await renewToken());
}
