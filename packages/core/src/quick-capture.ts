export interface QuickCapture {
 title:string; dateHint:'today'|'tomorrow'|null; time:string|null; durationMin:number|null;
}

export function parseQuickCapture(text:string):QuickCapture{
 const time=text.match(/(?:в|на)\s*(\d{1,2})[:.](\d{2})/i);
 const duration=text.match(/(\d+)\s*(?:мин|минут)/i);
 const dateHint=/завтра/i.test(text)?'tomorrow':/сегодня/i.test(text)?'today':null;
 const title=text.replace(/\b(сегодня|завтра)\b/ig,'').replace(/(?:в|на)\s*\d{1,2}[:.]\d{2}/ig,'').replace(/на\s+\d+\s*(?:мин|минут\w*)/ig,'').replace(/\s+/g,' ').trim();
 return {title,dateHint,time:time?`${time[1].padStart(2,'0')}:${time[2]}`:null,durationMin:duration?Number(duration[1]):null};
}
