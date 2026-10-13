import{useEffect,useMemo,useRef,useState}from'react';
import type{PersonaCarouselDraft}from'./persona-content';
import{generateWithAI,reviseWithAI}from'./persona-ai';
import{buildIdeaBank,captureAssignment,runFinalQA,type ContentIdea,type IdeaStatus}from'./persona-factory';
import'./persona-today.css';

type QAState={pass:boolean;score:number;issues?:{target?:string;instruction?:string;message?:string}[]};
type Saved={idea:ContentIdea;draft:PersonaCarouselDraft;version:number;approved:boolean;lastChange:string;qa?:QAState};
type IdeaHistory={title:string;status:IdeaStatus};
const SESSION='lifeos:persona:today:v4',IDEAS='lifeos:persona:idea-history:v1';

function loadSaved():Saved|null{try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch{return null}}
function loadHistory():IdeaHistory[]{try{const x=JSON.parse(localStorage.getItem(IDEAS)||'[]');return Array.isArray(x)?x:[]}catch{return[]}}
async function copy(text:string){try{await navigator.clipboard.writeText(text);return true}catch{return false}}
function friendlyError(value:unknown){const raw=String((value as any)?.message||value||'').toLowerCase();if(raw.includes('temporarily')||raw.includes('unavailable')||raw.includes('503')||raw.includes('401'))return'AI-редакция сейчас переподключается. Техническая ошибка скрыта; попробуй ещё раз через кнопку — исходная идея и правка сохранены.';if(raw.includes('qa_failed'))return'Материал не прошёл внутреннюю самопроверку и поэтому не показан как готовый. Редакция должна переделать его.';if(raw.includes('voice'))return'Голос сейчас не удалось распознать. Запись не считается применённой — можно повторить или написать правку текстом.';return'Операцию не удалось закончить. Исходные данные сохранены; система не будет выдавать незавершённый результат за готовый.'}
function svgSlide(s:{eyebrow:string;title:string;body:string},i:number,total:number){const esc=(x:string)=>x.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&apos;'}[c]||c));const wrap=(x:string,n:number)=>{const a=x.split(' '),o:string[]=[];let l='';for(const w of a){if((l+' '+w).trim().length>n&&l){o.push(l);l=w}else l=(l+' '+w).trim()}if(l)o.push(l);return o};const title=wrap(s.title,20).slice(0,4),body=wrap(s.body,36).slice(0,7);const titleSize=title.length>=4?56:title.length===3?62:70;const bodyY=760+title.length*72;return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="${i%2?'#171717':'#efe7d9'}"/><circle cx="900" cy="180" r="150" fill="${i%2?'#813a31':'#d9b8aa'}" opacity=".75"/><circle cx="960" cy="120" r="210" fill="none" stroke="${i%2?'#eee5d8':'#777'}" opacity=".45" stroke-width="3"/><text x="85" y="120" font-family="Arial,sans-serif" font-size="25" letter-spacing="7" fill="${i%2?'#d7d0c6':'#75816c'}">${esc(s.eyebrow)}</text><text x="930" y="120" text-anchor="end" font-family="Arial,sans-serif" font-size="24" fill="${i%2?'#aaa':'#777'}">${i+1}/${total}</text>${title.map((l,j)=>`<text x="85" y="${500+j*76}" font-family="Arial,sans-serif" font-weight="700" font-size="${titleSize}" fill="${i%2?'#fff':'#151515'}">${esc(l)}</text>`).join('')}${body.map((l,j)=>`<text x="85" y="${bodyY+j*46}" font-family="Arial,sans-serif" font-size="33" fill="${i%2?'#c9c9c9':'#666'}">${esc(l)}</text>`).join('')}</svg>`}
async function slideJpeg(slide:{eyebrow:string;title:string;body:string}, index:number,total:number):Promise<File> {
  const svg=new Blob([svgSlide(slide,index,total)],{type:'image/svg+xml;charset=utf-8'});
  const uri=URL.createObjectURL(svg);
  try {
    const image=new Image();
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('SVG preview cannot be rendered'));image.src=uri;});
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1080,1350);ctx.drawImage(image,0,0,1080,1350);
    const jpeg=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG conversion failed')),'image/jpeg',.93));
    return new File([jpeg],`persona-${String(index+1).padStart(2,'0')}.jpg`,{type:'image/jpeg'});
  } finally {URL.revokeObjectURL(uri);}
}
async function shareApproved(draft:PersonaCarouselDraft) {
  const files:File[]=[];
  for(let i=0;i<draft.slides.length;i++)files.push(await slideJpeg(draft.slides[i],i,draft.slides.length));
  const nav=navigator as Navigator & {canShare?:(data:{files:File[]})=>boolean};
  if(typeof nav.share==='function' && nav.canShare?.({files})) {
    try {
      await nav.share({title:draft.title,text:draft.caption,files});
      return 'JPEG-файлы переданы системному меню iPhone. Подтверждения Instagram ещё нет — статус публикации НЕ установлен.';
    } catch(e:any) {
      if(e?.name==='AbortError')return 'Передача файлов отменена. Instagram-публикация не выполнялась.';
    }
  }
  for(const file of files) {
    const url=URL.createObjectURL(file);const a=document.createElement('a');
    a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const copied=await copy(draft.caption);
  return `JPEG подготовлены для сохранения. ${copied?'Подпись скопирована.':'Подпись можно скопировать отдельно.'} Instagram-публикация не подтверждена.`;
}
function packageForQA(draft:PersonaCarouselDraft){return{title:draft.title,publicText:draft.caption,format:'carousel' as const,platforms:['instagram','vk'] as const,assets:[],slides:draft.slides.map(s=>({title:s.title,body:s.body}))}}

export default function PersonaToday(){
 const saved=loadSaved();
 const[history,setHistory]=useState<IdeaHistory[]>(()=>loadHistory()),[chosen,setChosen]=useState<ContentIdea|null>(saved?.idea||null),[draft,setDraft]=useState<PersonaCarouselDraft|null>(saved?.draft||null),[feedback,setFeedback]=useState(''),[approved,setApproved]=useState(saved?.approved||false),[recording,setRecording]=useState(false),[transcribing,setTranscribing]=useState(false),[working,setWorking]=useState(false),[version,setVersion]=useState(saved?.version||1),[lastChange,setLastChange]=useState(saved?.lastChange||''),[qa,setQa]=useState<QAState|undefined>(saved?.qa),[copied,setCopied]=useState(''),[ideasOpen,setIdeasOpen]=useState(false);
 const recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<Blob[]>([]);
 const ideas=useMemo(()=>{const found=buildIdeaBank(history);if(history.length>0)return found;const first=found.find(x=>x.title==='Почему я не хочу показывать только результат');return first?[first,...found.filter(x=>x.id!==first.id)]:found;},[history]);
 const assignment=chosen?captureAssignment(chosen,[]):null;
 useEffect(()=>()=>{try{if(recorder.current?.state==='recording')recorder.current.stop()}catch{}stream.current?.getTracks().forEach(t=>t.stop())},[]);
 useEffect(()=>{localStorage.setItem(IDEAS,JSON.stringify(history));if(chosen&&draft)localStorage.setItem(SESSION,JSON.stringify({idea:chosen,draft,version,approved,lastChange,qa}))},[history,chosen,draft,version,approved,lastChange,qa]);
 function remember(idea:ContentIdea,status:IdeaStatus){setHistory(h=>[...h.filter(x=>x.title!==idea.title),{title:idea.title,status}])}
 function resetSession(){localStorage.removeItem(SESSION);setApproved(false);setDraft(null);setChosen(null);setFeedback('');setVersion(1);setLastChange('');setQa(undefined);setCopied('')}
 function choose(idea:ContentIdea){setChosen(idea);setDraft(null);setApproved(false);setFeedback('');setVersion(1);setLastChange('');setQa(undefined);setIdeasOpen(false)}
 async function generateFor(idea:ContentIdea){if(working)return;setChosen(idea);setDraft(null);setApproved(false);setQa(undefined);if(idea.format!=='carousel'){const a=captureAssignment(idea,[]);setLastChange(a?.instruction||'Для этого формата системе сначала нужен исходный материал.');return}setWorking(true);setLastChange('Редакция создаёт материал → маркетолог проверяет → независимый QA решает, можно ли показывать результат…');try{const result=await generateWithAI(idea);setDraft(result.draft);setQa(result.qa);setVersion(1);setLastChange(`${result.summary}${result.qa?.score?` · QA ${result.qa.score}/100`:''}`)}catch(e){setLastChange(friendlyError(e))}finally{setWorking(false)}}
 async function generate(){if(chosen)await generateFor(chosen)}
 async function startRecording(){if(recording||transcribing)return;if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setLastChange('Запись аудио недоступна в этом браузере. Можно написать правку текстом.');return}try{const s=await navigator.mediaDevices.getUserMedia({audio:true});stream.current=s;chunks.current=[];const r=new MediaRecorder(s);recorder.current=r;r.ondataavailable=e=>{if(e.data.size)chunks.current.push(e.data)};r.onstop=async()=>{s.getTracks().forEach(t=>t.stop());setRecording(false);const blob=new Blob(chunks.current,{type:r.mimeType||'audio/webm'});if(!blob.size)return;setTranscribing(true);setLastChange('Запись закончена. Теперь целиком отправляю её на транскрибацию…');try{const form=new FormData();form.append('audio',blob,`voice-${Date.now()}.webm`);const response=await fetch('/api/media/status',{method:'POST',body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'voice_temporarily_unavailable');const text=String(data.transcript||'').trim();if(!text)throw new Error('voice_temporarily_unavailable');setFeedback(x=>[x.trim(),text].filter(Boolean).join(' '));setLastChange('Голосовое распознано целиком. Правка ещё не применена — проверь текст или сразу нажми «Исправить».')}catch(e){setLastChange(friendlyError(e))}finally{setTranscribing(false)}};r.start();setRecording(true);setLastChange('Запись идёт. Паузы её не остановят. Нажми ■ только когда закончишь всё сообщение.')}catch{setLastChange('Не удалось получить доступ к микрофону. Проверь разрешение Safari на микрофон.')}}
 function stopRecording(){if(recorder.current?.state==='recording')recorder.current.stop()}
 async function fix(){if(!draft||!feedback.trim()||working)return;const command=feedback.trim();setWorking(true);setLastChange('Редактор понимает всю команду целиком → применяет → маркетолог и QA перепроверяют результат…');try{const result=await reviseWithAI(draft,command);setDraft(result.draft);setQa(result.qa);setVersion(v=>v+1);setLastChange(`${result.summary}${result.qa?.score?` · QA ${result.qa.score}/100`:''}${result.rules.length?` · Запомнено: ${result.rules.join('; ')}`:''}`);setFeedback('')}catch(e){setLastChange(friendlyError(e))}finally{setWorking(false)}}
 function approve(){if(!draft)return;const local=runFinalQA(packageForQA(draft) as any);if(!qa?.pass||!local.pass){setLastChange(`Утверждение заблокировано: материал ещё не прошёл все проверки.${!local.pass?' '+local.issues.map(x=>x.message).join('; '):''}`);return}setApproved(true)}
 async function copyCaption(){if(!draft)return;setCopied(await copy(draft.caption)?'Текст скопирован':'Не удалось скопировать')}
 async function copyPackage(){if(!draft)return;const slides=draft.slides.map((s,i)=>`${i+1}. ${s.eyebrow}\n${s.title}\n${s.body}`).join('\n\n');setCopied(await copy(`${draft.title}\n\n${slides}\n\n${draft.caption}`)?'Весь пакет скопирован':'Не удалось скопировать')}
 async function publish(){if(!draft)return;setWorking(true);try{setCopied(await shareApproved(draft))}finally{setWorking(false)}}

 if(approved&&draft)return <section className="personaToday"><div className="personaSuccess"><small>ГОТОВО К РУЧНОЙ ПЕРЕДАЧЕ · НЕ ОПУБЛИКОВАНО · ВЕРСИЯ {version}</small><h2>{draft.title}</h2><p>Материал прошёл проверки текста и формата{qa?.score?` · ${qa.score}/100`:''}.</p><div className="carouselPreview">{draft.slides.map((s,i)=><article className="carouselSlide" key={i}><small>{s.eyebrow}</small><strong>{s.title}</strong><p>{s.body}</p><span>{i+1}/{draft.slides.length}</span></article>)}</div><div className="captionCard"><small>ТЕКСТ ПУБЛИКАЦИИ</small><p>{draft.caption}</p>{copied&&<div className="personaChangeStatus">{copied}</div>}<div className="draftActions"><button className="ghost" onClick={copyCaption}>Копировать текст</button><button className="primary" onClick={copyPackage}>Копировать всё</button></div><button className="publishNow" disabled={working} onClick={publish}>{working?'Готовлю…':'Опубликовать с iPhone'}</button><p role="status">Автопубликация через Instagram пока не подключена. Системное «Поделиться» не подтверждает размещение поста.</p><div className="draftActions"><button className="ghost" onClick={()=>setApproved(false)}>Вернуть к правкам</button><button className="primary" onClick={resetSession}>Следующий материал</button></div></div></div></section>;

 return <section className="personaToday">
  <div className="personaTodayHead"><small>ВНУТРЕННЯЯ РЕДАКЦИЯ</small><h2>Что готовим сегодня</h2><p>Система сама выбирает сильную идею, создаёт материал и показывает тебе только версию, прошедшую самопроверку.</p></div>
  {!chosen?<>
   {ideas[0]?<div className="personaRecommendation"><small>РЕКОМЕНДАЦИЯ СЕГОДНЯ · {ideas[0].score}/100</small><strong>{ideas[0].title}</strong><span>{ideas[0].angle}</span><button disabled={working} onClick={()=>generateFor(ideas[0])}>{working?'Редакция работает…':'Подготовить сегодняшний материал'}</button><button className="recommendationGhost" onClick={()=>setIdeasOpen(v=>!v)}>{ideasOpen?'Скрыть банк идей':`Другие идеи · ${ideas.length}`}</button></div>:<div className="personaEmptyState">Банк идей исчерпан. Использованные и отклонённые темы сохранены в истории.</div>}
   {ideasOpen&&<div className="personaIdeaBank"><div className="ideaBankHead"><b>Банк идей</b><span>Не нужно выбирать тему каждый раз — это запас и ручное управление.</span></div><div className="topicGrid">{ideas.map((idea,i)=><article className="personaIdeaCard" key={idea.id}><button className="personaIdeaMain" onClick={()=>choose(idea)}><small>{String(i+1).padStart(2,'0')} · {idea.format.toUpperCase()} · {idea.score}/100</small><strong>{idea.title}</strong><span>{idea.angle}</span></button><div className="personaIdeaActions"><button onClick={()=>remember(idea,'later')}>На потом</button><button onClick={()=>remember(idea,'rejected')}>Неинтересно</button></div></article>)}</div></div>}
  </>:!draft?<div className="draftCard"><small>{chosen.format.toUpperCase()} · {chosen.score}/100</small><h3>{chosen.title}</h3><p>{chosen.angle}</p>{chosen.format!=='carousel'&&assignment&&<div className="captureAssignment"><b>От тебя нужен только исходник</b><span>{assignment.instruction}</span></div>}<div className="draftActions"><button className="ghost" onClick={()=>{setChosen(null);setLastChange('')}}>Другую идею</button><button className="primary" disabled={working||chosen.format!=='carousel'} onClick={generate}>{working?'Работает редакция…':'Сделать материал'}</button></div>{lastChange&&<div className="personaChangeStatus" role="status">{lastChange}</div>}</div>:<>
   <div className={`qaBar ${qa?.pass?'qaPass':'qaPending'}`}><b>{qa?.pass?'✓ QA ПРОЙДЕН':'QA НЕ ЗАВЕРШЁН'}</b><span>{qa?.score?`${qa.score}/100`:''}</span></div>
   <div className="carouselPreview">{draft.slides.map((s,i)=><article className="carouselSlide" key={`${version}-${i}`}><small>{s.eyebrow}</small><strong>{s.title}</strong><p>{s.body}</p><span>{i+1}/{draft.slides.length}</span></article>)}</div>
   <div className="captionCard"><small>ВЕРСИЯ {version} · ТЕКСТ К ПУБЛИКАЦИИ</small><p>{draft.caption}</p>{lastChange&&<div className="personaChangeStatus" role="status">{lastChange}</div>}<div className="feedbackBox"><textarea value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="Скажи или напиши правку обычными словами — можно длинно и с несколькими требованиями."/><button className={recording?'mic listening':'mic'} disabled={transcribing} onClick={recording?stopRecording:startRecording}>{transcribing?'…':recording?'■':'🎙️'}</button></div><small className="voiceHint">{recording?'Записываю до твоего нажатия. Паузы не останавливают запись.':transcribing?'Распознаю полную запись…':'Нажми 🎙️ → скажи всё → нажми ■. Только после этого начнётся распознавание.'}</small><div className="draftActions"><button className="ghost" disabled={!feedback.trim()||working||recording||transcribing} onClick={fix}>{working?'Исправляю + проверяю…':'Исправить'}</button><button className="primary" disabled={working||!qa?.pass} onClick={approve}>Утверждаю</button></div></div>
  </>}
 </section>
}
