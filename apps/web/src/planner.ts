import type{Item}from'./types';export type PlannedDraft={title:string;durationMin:number;start?:string;end?:string};const DUR=/(полчаса|(\d+)\s*(минут|минуты|мин|час|часа|часов))/i;const mins=(s?:string)=>!s?30:/полчаса/i.test(s)?30:/час/i.test(s)?Number(s.match(/\d+/)?.[0]||1)*60:Number(s.match(/\d+/)?.[0]||30);const hm=(n:number)=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');const nmin=(s:string)=>{const[h,m]=s.split(':').map(Number);return h*60+m};export function planCompound(text:string,items:Item[],now=new Date()):PlannedDraft[]{const chunks=text.split(/,|\s+а\s+ещ[её]\s+|\s+потом\s+/i).map(x=>x.trim()).filter(Boolean),drafts=chunks.map(c=>{const start=c.match(/(?:в|к)\s+(\d{1,2}:\d{2})/i)?.[1],d=c.match(DUR)?.[0],title=c.replace(/(?:мне\s+)?нужно\s*/ig,'').replace(/(?:в|к)\s+\d{1,2}:\d{2}/ig,'').replace(DUR,'').replace(/(?:для того чтобы|чтобы)\s*/ig,'').replace(/^(?:до этого|ещ[её] до этого)\s*/i,'').trim();return{title,durationMin:mins(d),start}}).filter(x=>x.title);const fixed=drafts.findIndex(x=>x.start);if(fixed<0){const busy=items.flatMap(i=>i.planned_start&&i.planned_end?[{s:nmin(i.planned_start.slice(11,16)),e:nmin(i.planned_end.slice(11,16))}]:[]).sort((a,b)=>a.s-b.s);let cursor=Math.max(9*60,now.getHours()*60+now.getMinutes());for(const d of drafts){let placed=false;for(let s=cursor;s+d.durationMin<=23*60;s+=15){if(!busy.some(b=>s<b.e&&s+d.durationMin>b.s)){d.start=hm(s);d.end=hm(s+d.durationMin);busy.push({s,e:s+d.durationMin});busy.sort((a,b)=>a.s-b.s);cursor=s+d.durationMin;placed=true;break}}if(!placed){d.start=undefined;d.end=undefined}}return drafts;}let cursor=nmin(drafts[fixed].start!);const busy=items.flatMap(i=>i.planned_start&&i.planned_end?[{s:nmin(i.planned_start.slice(11,16)),e:nmin(i.planned_end.slice(11,16))}]:[]);for(let i=drafts.length-1;i>=0;i--){if(i===fixed)continue;let e=cursor,s=e-drafts[i].durationMin;for(const b of busy.sort((a,b)=>b.s-a.s))if(s<b.e&&e>b.s){e=b.s;s=e-drafts[i].durationMin}drafts[i].start=hm(s);drafts[i].end=hm(e);cursor=s}drafts[fixed].end=hm(nmin(drafts[fixed].start!)+drafts[fixed].durationMin);return drafts}
/**
 * A stated time range is an instruction, not a hint for free-slot scheduling.
 * e.g. "Сегодня с 22:30 до 23:00 снять пробный рилс".
 */
export interface ExactTimeRange {
  title: string;
  start: string;
  end: string;
  dayOffset: 0 | 1;
}
export function parseExactTimeRange(input: string): ExactTimeRange | null {
  const match = /(?:^|\s)(?:с\s+)?(\d{1,2}):(\d{2})\s*(?:до|[-–—])\s*(\d{1,2}):(\d{2})(?=$|\s|[.,!?])/iu.exec(input);
  if (!match) return null;
  const [startHour, startMinute, endHour, endMinute] =
    [match[1], match[2], match[3], match[4]].map(Number);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59 ||
      endHour * 60 + endMinute <= startHour * 60 + startMinute) {
    throw new Error('Проверь указанный интервал: конец должен быть позже начала, часы от 0 до 23.');
  }
  const dayOffset: 0 | 1 = /(?:^|\s)завтра(?=\s|$|[.,!?])/iu.test(input) ? 1 : 0;
  const stripped = (input.slice(0, match.index) + ' ' + input.slice(match.index + match[0].length))
    .replace(/(?:^|\s)(?:сегодня|завтра)(?=\s|$|[.,!?])/giu, ' ')
    .replace(/^\s*(?:добавь|запланируй|поставь|создай|напомни|нужно|хочу)\s+/iu, '')
    .replace(/[.,!?]+$/u, '').trim().replace(/\s+/g, ' ');
  if (!stripped) throw new Error('Напиши, какую задачу нужно запланировать.');
  const format = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return {
    title: stripped,
    start: format(startHour, startMinute),
    end: format(endHour, endMinute),
    dayOffset,
  };
}

/** Browser-calendar date, not UTC and not the date of an existing task. */
export function planLocalDate(now: Date, dayOffset: 0 | 1 = 0): string {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, 12);
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2,'0'),
          String(day.getDate()).padStart(2,'0')].join('-');
}

/** Preserve local wall-clock time AND the browser's offset on the target date. */
export function planLocalDateTime(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const instant = new Date(year, month - 1, day, hour, minute);
  if (instant.getFullYear() !== year || instant.getMonth() !== month - 1 ||
      instant.getDate() !== day || instant.getHours() !== hour || instant.getMinutes() !== minute) {
    throw new Error('Такого времени нет в местном календаре.');
  }
  const offset = -instant.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${date}T${time}:00${sign}${String(Math.floor(absolute / 60)).padStart(2,'0')}:${String(absolute % 60).padStart(2,'0')}`;
}
