import{cookie,env,unseal}from'../_media-session.js';
type TokenSession={accessToken?:string|null};
export async function resolveMediaStateToken(request:Request):Promise<string|null>{const durable=env('YANDEX_DISK_OAUTH_TOKEN');if(durable)return durable;const secret=env('MEDIA_COOKIE_SECRET'),raw=cookie(request,'lifeos_yandex_token');if(!secret||!raw)return null;try{const session=await unseal<TokenSession>(raw,secret);return session.accessToken?.trim()||null}catch{return null}}
