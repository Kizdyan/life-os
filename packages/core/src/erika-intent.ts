export type ErikaIntent =
 | {type:'today'}
 | {type:'complete';query:string}
 | {type:'not_complete';query:string;carryForward:boolean}
 | {type:'move';query:string;when:'tomorrow'|'unspecified'}
 | {type:'unknown';text:string};

export function detectErikaIntent(text:string):ErikaIntent{
  const clean=text.trim();
  if(/(что|какие).*(сегодня|на сегодня)/i.test(clean)) return {type:'today'};
  const carry=/перенес(и|ти).*завтра|на завтра/i.test(clean);
  if(/не (сделал|сделала|выполнил|выполнила)|не выполнено/i.test(clean))
    return {type:'not_complete',query:clean,carryForward:carry};
  if(/перенес(и|ти)|перенос/i.test(clean))
    return {type:'move',query:clean,when:/завтра/i.test(clean)?'tomorrow':'unspecified'};
  if(/сделал|сделала|выполнил|выполнила|готово/i.test(clean))
    return {type:'complete',query:clean};
  return {type:'unknown',text:clean};
}
