const encoder=new TextEncoder(),decoder=new TextDecoder();

export function env(name:string):string{return(process.env[name]??'').trim()}
export function cookie(request:Request,name:string):string|null{const raw=request.headers.get('cookie')??'';for(const part of raw.split(';')){const i=part.indexOf('=');if(i<0)continue;if(part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim())}return null}
export function setCookie(name:string,value:string,maxAge:number):string{return`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.max(0,Math.floor(maxAge))}`}
export function clearCookie(name:string):string{return`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`}
export function randomUrlSafe(bytes=32):string{const data=crypto.getRandomValues(new Uint8Array(bytes));return b64(data)}

export async function seal(value:unknown,secret:string):Promise<string>{if(secret.length<24)throw new Error('MEDIA_COOKIE_SECRET must be at least 24 characters');const iv=crypto.getRandomValues(new Uint8Array(12)),key=await aesKey(secret),plain=encoder.encode(JSON.stringify(value)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:asArrayBuffer(iv)},key,asArrayBuffer(plain));return`${b64(iv)}.${b64(new Uint8Array(cipher))}`}
export async function unseal<T>(token:string,secret:string):Promise<T>{const[a,b]=token.split('.');if(!a||!b)throw new Error('Invalid sealed session');const iv=unb64(a),cipher=unb64(b),key=await aesKey(secret),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:asArrayBuffer(iv)},key,asArrayBuffer(cipher));return JSON.parse(decoder.decode(plain)) as T}
export function json(data:unknown,status=200,headers:HeadersInit={}):Response{const responseHeaders=new Headers(headers);if(!responseHeaders.has('Cache-Control'))responseHeaders.set('Cache-Control','no-store');return Response.json(data,{status,headers:responseHeaders})}
export function sameOriginRedirect(request:Request,path='/'):Response{const url=new URL(request.url);return Response.redirect(new URL(path,url.origin),302)}

async function aesKey(secret:string):Promise<CryptoKey>{const digest=await crypto.subtle.digest('SHA-256',asArrayBuffer(encoder.encode(secret)));return crypto.subtle.importKey('raw',digest,{name:'AES-GCM'},false,['encrypt','decrypt'])}
function asArrayBuffer(bytes:Uint8Array):ArrayBuffer{return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer}
function b64(bytes:Uint8Array):string{let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'')}
function unb64(value:string):Uint8Array{const normalized=value.replace(/-/g,'+').replace(/_/g,'/'),pad='='.repeat((4-normalized.length%4)%4),binary=atob(normalized+pad),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out}
