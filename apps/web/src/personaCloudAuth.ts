/** Explicit Supabase email OTP sign-in. No privileged keys, implicit writes, or token logging. */
export type PersonaCloudSession={access_token:string;refresh_token:string;expires_at?:number;user:{id:string;email?:string}};
const SESSION_KEY='persona:cloud-session:v1';
function settings(){
 const url=import.meta.env.VITE_SUPABASE_URL as string|undefined;
 const key=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string|undefined;
 if(!url||!key)throw Error('Облачный вход пока не настроен для этой версии приложения.');
 const base=new URL(url);
 if(base.protocol!=='https:')throw Error('Требуется защищённое HTTPS-соединение.');
 return {base:base.origin,key};
}
export function cloudAuthConfigured(){try{settings();return true}catch{return false}}
export function getCloudSession():PersonaCloudSession|null{
 try{
  const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');
  return value&&typeof value.access_token==='string'&&typeof value.user?.id==='string'&&(!value.expires_at||value.expires_at*1000>Date.now())?value:null;
 }catch{return null}
}
export async function requestPersonaLogin(email:string){
 const {base,key}=settings();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))throw Error('Укажи корректный email.');
 const response=await fetch(base+'/auth/v1/otp',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),create_user:true})});
 if(!response.ok)throw Error('Не удалось отправить письмо для входа ('+response.status+').');
}
export async function verifyPersonaEmailCode(email:string,token:string):Promise<PersonaCloudSession>{
 const {base,key}=settings();
 if(!/^\d{6,8}$/.test(token.trim()))throw Error('Введите код из письма.');
 const response=await fetch(base+'/auth/v1/verify',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),token:token.trim(),type:'email'})});
 if(!response.ok)throw Error('Неверный или истёкший код ('+response.status+').');
 const data=await response.json() as PersonaCloudSession;
 if(!data.access_token||!data.user?.id)throw Error('Сервер не вернул действительную сессию.');
 sessionStorage.setItem(SESSION_KEY,JSON.stringify(data));
 return data;
}
export function signOutPersonaCloud(){sessionStorage.removeItem(SESSION_KEY)}
