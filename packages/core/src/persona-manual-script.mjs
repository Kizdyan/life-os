/** Faithful authored script structure; no creative generation or approval. */
export function extractManualScenes(text){
 if(typeof text!=='string'||text.trim().length<20||text.length>20000)throw Error('Вставьте сценарий до 20 000 знаков с таймингом каждого кадра.');
 const pattern=/^[ \t•*#-]*(\d+(?:[.,]\d+)?)\s*[–—-]\s*(\d+(?:[.,]\d+)?)\s*(?:сек(?:унд[ыа]?)?|с|sec|s)\.?\s*:\s*(.+)$/gmu;
 const matches=[...text.matchAll(pattern)];
 if(matches.length<2||matches.length>30)throw Error('Нужны 2–30 кадров в формате «0–2 сек: действие».');
 let cursor=0;
 return matches.map((m,i)=>{
  const startSec=Number(m[1].replace(',','.')),endSec=Number(m[2].replace(',','.'));
  if(Math.abs(startSec-cursor)>.001||endSec-startSec<.25||endSec-startSec>60)throw Error('Плановые интервалы должны идти от 0 без пропусков и наложений, по 0,25–60 с.');
  cursor=endSec;
  const between=text.slice(m.index+m[0].length,matches[i+1]?.index??text.length);
  const continuation=between.split(/\r?\n/).map(line=>line.replace(/^[ \t•*#-]+/u,'')).filter(line=>line.trim());
  const extra=continuation;
  if(extra.some(line=>/^\d+.*(?:сек|sec|–|→|—)/iu.test(line)))throw Error('Непонятный тайминг кадра; используйте «0–2 сек: действие».');
  const action=[m[3].trim(),...extra].join('\n');
  const caption=(/\(Текст:[ \t]*(.*?)\)/iu.exec(action)?.[1]??/^(?:Текст|Титр):[ \t]*(.+)$/imu.exec(action)?.[1]??'').trim();
  let speech=/(?:Реплика|Голос):[ \t]*([\s\S]+?)(?=\s*\(Текст:|\n(?:Действие|Музыка|Саунд-дизайн|Музыкальный акцент|Текст|Титр|Камера|Свет|Цвет|Локация|Монтаж|Одежда|Кульминация|Паузы):|$)/iu.exec(action)?.[1]?.trim()??'';
  if((speech.startsWith('«')&&speech.endsWith('»'))||(speech.startsWith('"')&&speech.endsWith('"')))speech=speech.slice(1,-1);
  return {order:i+1,startSec,endSec,durationSec:Number((endSec-startSec).toFixed(3)),action,caption,speech};
 });
}
export function validateManualSource(value,script){
 const v=value;
 if(!v||v.version!==1||typeof v.sourceText!=='string'||v.sourceText.length>20000||!/^[a-f0-9]{64}$/.test(v.sourceSha256??'')||typeof v.model!=='string'||!v.model||!Array.isArray(v.scenes))throw Error('Invalid manual script provenance');
 const rows=extractManualScenes(v.sourceText);
 if(!Array.isArray(script)||rows.length!==script.length||v.scenes.length!==rows.length)throw Error('Manual script scene count changed; parse the new revision again');
 for(const [i,row] of rows.entries()){
  const s=v.scenes[i],beat=script[i];
  if(s.order!==i+1||!['visual','spoken'].includes(s.kind)||s.kind!==(row.speech?'spoken':'visual')||s.caption!==row.caption||s.spokenText!==row.speech||typeof s.musicAccent!=='string'||s.musicAccent.length>300||s.musicAccent&&!row.action.includes(s.musicAccent)||beat.order!==i+1||beat.action!==row.action||beat.durationSec!==row.durationSec||beat.line!==(row.speech||row.caption||row.action))throw Error('Manual script text or timing changed; parse the new revision again');
 }
 return v;
}
