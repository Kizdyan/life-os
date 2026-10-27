import React, {useState} from 'react';
import {cloudAuthConfigured,getCloudSession,requestPersonaLogin,verifyPersonaEmailCode,signOutPersonaCloud} from './personaCloudAuth';
import {listCloudProjects} from './personaCloudProjects';
export default function PersonaCloudPanel(){
 const [session,setSession]=useState(getCloudSession);
 const [email,setEmail]=useState('');
 const [code,setCode]=useState('');
 const [sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 const [titles,setTitles]=useState<string[]|null>(null);
 const [checked,setChecked]=useState(false);
 async function run(fn:()=>Promise<void>){setBusy(true);setMessage('');try{await fn()}catch(e){setMessage(e instanceof Error?e.message:'Ошибка соединения')}finally{setBusy(false)}}
 return <details className="personaCloudPanel"><summary>Облачные проекты · {session?'вход выполнен':'вход'}</summary>
 {!cloudAuthConfigured()?<p>В этой сборке облачный вход не настроен.</p>:session?<>
 <p>Облачные проекты доступны только для просмотра. Автоматической перезаписи локальных данных нет.</p>
 <button type="button" disabled={busy} onClick={()=>void run(async()=>{
 const url=import.meta.env.VITE_SUPABASE_URL as string;
 const publishableKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
 const result=await listCloudProjects({url,publishableKey,accessToken:session.access_token});
 setTitles(result.map(p=>p.title));setChecked(true);
 })}>Посмотреть проекты</button>
 <button type="button" disabled={busy} onClick={()=>{signOutPersonaCloud();setSession(null);setTitles(null);setChecked(false)}}>Выйти</button>
 {checked&&titles&&<div role="status"><p>{titles.length?`Найдено проектов: ${titles.length}`:'Облачных проектов пока нет.'}</p>{titles.map((title,i)=><p key={i}>{title}</p>)}</div>}
 </>:<>
 <p>Вход по коду из письма. Черновики не загружаются автоматически.</p>
 <label>Электронная почта <input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
 <button type="button" disabled={busy||!email} onClick={()=>void run(async()=>{await requestPersonaLogin(email);setSent(true);setMessage('Проверь почту.')})}>Получить код</button>
 {sent&&<><label>Код <input inputMode="numeric" value={code} onChange={e=>setCode(e.target.value)}/></label>
 <button type="button" disabled={busy||!code} onClick={()=>void run(async()=>{setSession(await verifyPersonaEmailCode(email,code));setCode('')})}>Войти</button></>}
 </>}
 {message&&<p role="status">{message}</p>}
 </details>;
}
