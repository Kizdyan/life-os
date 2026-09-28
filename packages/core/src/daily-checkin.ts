export interface DailyCheckin {
  date:string;
  sleepHours:number|null;
  energy:number|null;
  mood:number|null;
  note:string|null;
}

export function normalizeSleep(value:string|number|null|undefined):number|null{
  if(value===null||value===undefined||value==='') return null;
  const n=typeof value==='number'?value:Number(String(value).replace(',','.'));
  if(!Number.isFinite(n)||n<0||n>24) throw new Error('Invalid sleep hours');
  return Math.round(n*10)/10;
}
