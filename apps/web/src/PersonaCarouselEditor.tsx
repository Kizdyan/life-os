import React, { useState } from 'react';

export interface CarouselSlide { eyebrow: string; title: string; body: string }
interface Props { initialSlides?: CarouselSlide[]; title?: string }
const initial: CarouselSlide[] = [
 { eyebrow: '01 / ВСТУПЛЕНИЕ', title: 'Главная мысль', body: 'О чём этот материал и почему он важен?' },
 { eyebrow: '02 / СУТЬ', title: 'Что происходит', body: 'Конкретная история, пример или наблюдение.' },
 { eyebrow: '03 / ФИНАЛ', title: 'Что дальше', body: 'Вывод, вопрос или продолжение истории.' },
];
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
 const lines: string[] = [];
 for (const paragraph of text.split('\n')) {
  let current = '';
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
   const next = current ? current + ' ' + word : word;
   if (ctx.measureText(next).width > maxWidth && current) { lines.push(current); current = word; }
   else current = next;
  }
  if (current) lines.push(current);
 }
 return lines.slice(0,maxLines);
}
function paint(slide: CarouselSlide, index: number, count: number): HTMLCanvasElement {
 const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas недоступен');
 ctx.fillStyle='#eae5dc';ctx.fillRect(0,0,1080,1350);
 ctx.fillStyle='#26332c';ctx.fillRect(0,0,1080,16);
 ctx.font='500 31px sans-serif';ctx.fillText(slide.eyebrow.toUpperCase().slice(0,80),84,150);
 ctx.fillStyle='#1e2924';ctx.font='bold 76px sans-serif';
 let y=310;
 for(const line of wrap(ctx,slide.title,912,5)){ctx.fillText(line,84,y);y+=92}
 ctx.font='42px sans-serif';ctx.fillStyle='#444f49';y=Math.max(y+68,650);
 for(const line of wrap(ctx,slide.body,900,11)){if(y>1190)break;ctx.fillText(line,84,y);y+=62}
 ctx.strokeStyle='#a6aba3';ctx.beginPath();ctx.moveTo(84,1240);ctx.lineTo(996,1240);ctx.stroke();
 ctx.font='30px sans-serif';ctx.fillText('PERSONA',84,1300);
 ctx.textAlign='right';ctx.fillText((index+1)+' / '+count,996,1300);ctx.textAlign='left';
 return canvas;
}
export default function PersonaCarouselEditor({initialSlides,title}:Props) {
 const [slides,setSlides]=useState<CarouselSlide[]>(()=>initialSlides?.length?initialSlides.map(s=>({...s})):initial);
 const [active,setActive]=useState(0);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const current=slides[Math.min(active,slides.length-1)];
 function update(field:keyof CarouselSlide,value:string) {
  setSlides(items=>items.map((slide,i)=>i===active?{...slide,[field]:value}:slide));
 }
 async function exportAll() {
  setBusy(true);setError('');
  try {
   for(let i=0;i<slides.length;i++){
    const canvas=paint(slides[i],i,slides.length);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Ошибка экспорта PNG')),'image/png'));
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='persona-carousel-'+String(i+1).padStart(2,'0')+'.png';
    document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),60000);
   }
  }catch(cause){setError(cause instanceof Error?cause.message:'Ошибка экспорта')}
  finally{setBusy(false)}
 }
 return <section className="captureCard" aria-label="Редактор карусели Persona">
  <h3>{title||'Карусель'} · редактор карточек</h3>
  <p>Редактирование текста и экспорт настоящих PNG 1080×1350. Все операции выполняются в браузере.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
   {slides.map((_,i)=><button key={i} type="button" className={i===active?'primary':'ghost'} onClick={()=>setActive(i)}>{i+1}</button>)}
   <button type="button" onClick={()=>{if(slides.length<12){setSlides(items=>[...items,{eyebrow:'НОВАЯ КАРТОЧКА',title:'Заголовок',body:'Текст'}]);setActive(slides.length)}}} disabled={slides.length>=12}>+ Карточка</button>
   <button type="button" onClick={()=>{if(slides.length>1){setSlides(items=>items.filter((_,i)=>i!==active));setActive(Math.max(0,active-1))}}} disabled={slides.length<=1}>Удалить</button>
  </div>
  <label>Рубрика<input value={current.eyebrow} maxLength={80} onChange={e=>update('eyebrow',e.target.value)}/></label>
  <label>Заголовок<input value={current.title} maxLength={160} onChange={e=>update('title',e.target.value)}/></label>
  <label>Текст<textarea value={current.body} maxLength={700} onChange={e=>update('body',e.target.value)}/></label>
  <button type="button" className="primary" disabled={busy} onClick={()=>void exportAll()}>{busy?'Экспорт…':`Экспортировать ${slides.length} PNG`}</button>
  {error&&<p role="alert">{error}</p>}
 </section>;
}
