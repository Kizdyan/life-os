import React,{useState} from 'react';
import {evaluatePublication,type PublicationMetrics} from './personaPublicationAnalytics';
export default function PersonaGrowthDashboard(){
 const [rows,setRows]=useState<PublicationMetrics[]>([]);
 const [format,setFormat]=useState<'reel'|'carousel'>('reel');
 const [topic,setTopic]=useState('');
 const [reach,setReach]=useState('0');
 const [saves,setSaves]=useState('0');
 const [shares,setShares]=useState('0');
 const [visits,setVisits]=useState('0');
 const [follows,setFollows]=useState('0');
 const [error,setError]=useState('');
 function add(){
  const numbers=[reach,saves,shares,visits,follows].map(Number);
  if(!topic.trim()||numbers.some((n,i)=>!Number.isSafeInteger(n)||n<0||![reach,saves,shares,visits,follows][i].trim())){setError('Заполни тему и показатели целыми неотрицательными числами');return}
  const [r,s,sh,v,f]=numbers;
  setRows(old=>[...old,{id:String(old.length+1),format,topic,publishedAt:new Date().toISOString(),reach:r,views:r,likes:0,comments:0,shares:sh,saves:s,profileVisits:v,follows:f}]);
  setTopic('');setError('');
 }
 const percentage=(v:number|null)=>v===null?'Нет данных':(100*v).toFixed(1)+'%';
 return <section className="captureCard"><h3>Аналитика Instagram: Reels и карусели</h3><p>Ручной ввод реальных показателей. Данные пока остаются только в открытой вкладке.</p>
 <label>Формат<select value={format} onChange={e=>setFormat(e.target.value as 'reel'|'carousel')}><option value="reel">Reels</option><option value="carousel">Карусель</option></select></label>
 <label>Тема<input value={topic} onChange={e=>setTopic(e.target.value)}/></label>
 {([['Охват',reach,setReach],['Сохранения',saves,setSaves],['Репосты',shares,setShares],['Переходы в профиль',visits,setVisits],['Новые подписчики',follows,setFollows]] as const).map(([label,value,set])=><label key={label}>{label}<input type="number" min="0" step="1" value={value} onChange={e=>set(e.target.value)}/></label>)}
 <button type="button" onClick={add}>Добавить публикацию</button>{error&&<p role="alert">{error}</p>}
 {rows.map(row=>{const result=evaluatePublication(row);return <div key={row.id}><strong>{row.topic} · {row.format}</strong><p>Сохранения / охват: {percentage(result.saveRate)} · Репосты / охват: {percentage(result.shareRate)} · Подписки / переходы: {percentage(result.followConversion)}</p></div>})}
 </section>;
}
