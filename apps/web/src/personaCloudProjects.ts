/** Opt-in, authenticated Persona project transport. No anonymous writes or implicit migration. */
export type CloudProject={id:string;owner_id:string;local_project_key:string;title:string;snapshot:unknown;revision:number;updated_at:string};
export type CloudCredentials={url:string;publishableKey:string;accessToken:string};
/** Validate untrusted RPC responses before treating a cloud write as successful. */
export function parseCloudProject(value:unknown):CloudProject{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Unexpected Persona cloud response: project object required. Local draft was not changed.');
 const p=value as Record<string,unknown>;
 if(typeof p.id!=='string'||!p.id||typeof p.owner_id!=='string'||!p.owner_id||typeof p.local_project_key!=='string'||typeof p.title!=='string'||!Number.isInteger(p.revision)||Number(p.revision)<0||typeof p.updated_at!=='string'||!('snapshot' in p))throw Error('Unexpected Persona cloud response: project fields missing. Local draft was not changed.');
 return p as CloudProject;
}

function endpoint(c:CloudCredentials,path:string){
 const base=new URL(c.url);
 if(base.protocol!=='https:')throw Error('Cloud sync requires HTTPS');
 if(!c.publishableKey||!c.accessToken||c.accessToken===c.publishableKey)throw Error('Sign in before syncing projects');
 return new URL(path,base).toString();
}
export class PersonaCloudRequestError extends Error {
 constructor(public readonly status:number,message:string){super(message);this.name='PersonaCloudRequestError'}
}
async function request<T>(c:CloudCredentials,path:string,body?:unknown):Promise<T>{
 const response=await fetch(endpoint(c,path),{method:body===undefined?'GET':'POST',headers:{apikey:c.publishableKey,Authorization:'Bearer '+c.accessToken,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 if(!response.ok){
  const status=response.status;
  const message=status===401?'Сессия истекла или недействительна. Войди заново. Локальный черновик сохранён.':status===403?'Нет доступа к облачному проекту. Локальный черновик сохранён.':status===409?'Конфликт версий: облачный проект изменился. Обнови данные перед повторным сохранением. Локальный черновик сохранён.':status===429?'Слишком много запросов. Повтори позже. Локальный черновик сохранён.':'Ошибка облака ('+status+'). Локальный черновик сохранён.';
  throw new PersonaCloudRequestError(status,message);
 }
 return response.json() as Promise<T>;
}
export function listCloudProjects(c:CloudCredentials):Promise<CloudProject[]>{
 return request<unknown>(c,'/rest/v1/persona_projects?select=id,owner_id,local_project_key,title,snapshot,revision,updated_at&order=updated_at.desc&limit=50').then(value=>{
  if(!Array.isArray(value))throw Error('Unexpected Persona cloud response: project list required.');
  return value.map(parseCloudProject);
 });
}
export function createCloudProject(c:CloudCredentials,p:{localKey:string;title:string;snapshot:unknown;requestKey:string}){
 if(!p.localKey||!p.title||!p.requestKey)throw Error('Missing project identity');
 return request<unknown>(c,'/rest/v1/rpc/persona_create_project',{p_local_project_key:p.localKey,p_title:p.title,p_snapshot:p.snapshot,p_request_key:p.requestKey}).then(parseCloudProject);
}
export function updateCloudProject(c:CloudCredentials,p:{projectId:string;expectedRevision:number;snapshot:unknown;mutationKey:string}){
 if(!p.projectId||!Number.isInteger(p.expectedRevision)||p.expectedRevision<0||!p.mutationKey)throw Error('Invalid project revision');
 return request<unknown>(c,'/rest/v1/rpc/persona_update_project',{p_project_id:p.projectId,p_expected_revision:p.expectedRevision,p_snapshot:p.snapshot,p_mutation_key:p.mutationKey}).then(parseCloudProject);
}
