/** Conservative, auditable normalization of Ollama JSON screenplay shot metadata.
 * Never invent spoken text, actions, timings, frames or creative structure.
 */
const FRAMING_ALIASES=new Map([
  ['close-up','close-up'],['close up','close-up'],['closeup','close-up'],
  ['cu','close-up'],['крупный план','close-up'],['крупный','close-up'],
  ['medium','medium'],['medium shot','medium'],['mid shot','medium'],
  ['ms','medium'],['средний план','medium'],['средний','medium'],
  ['detail','detail'],['detail shot','detail'],['insert','detail'],
  ['деталь','detail'],['детальный план','detail'],['макроплан','detail']
]);
function preview(value){
  try{
    const serialized=JSON.stringify(value);
    return serialized===undefined?String(value):serialized.slice(0,200);
  }catch{return '[unserializable]'}
}
export class PersonaLocalFrameValidationError extends Error{
  constructor(frameNumber,field,problem,value){
    super(`Некорректный кадр ${frameNumber}: ${field} — ${problem}`);
    this.name='PersonaLocalFrameValidationError';
    this.diagnostic={
      code:'FRAME_FIELD_INVALID',frameNumber,field,problem,
      actualType:value===null?'null':Array.isArray(value)?'array':typeof value,
      valuePreview:preview(value)
    };
  }
}
function normalizeFraming(value,index){
  if(typeof value!=='string'){
    throw new PersonaLocalFrameValidationError(index,'framing',
      'нужен план close-up, medium или detail',value);
  }
  const key=value.trim().toLocaleLowerCase('ru-RU').replace(/[_–—]+/g,' ').replace(/\s+/gu,' ');
  const normalized=FRAMING_ALIASES.get(key);
  if(!normalized){
    throw new PersonaLocalFrameValidationError(index,'framing',
      'неподдерживаемый план; нельзя молча заменить другим типом кадра',value);
  }
  return normalized;
}
function normalizeDuration(value,index){
  // Exact numeric/unit forms only. Never guess duration from dialogue length.
  if(typeof value==='number'){
    if(!Number.isFinite(value)||value<1||value>10)
      throw new PersonaLocalFrameValidationError(index,'durationSec','ожидается 1–10 секунд',value);
    return value;
  }
  if(typeof value==='string'){
    const input=value.trim().toLocaleLowerCase('ru-RU');
    const match=input.match(/^([0-9]+(?:[.,][0-9]+)?)\s*(?:с|сек|секунд(?:ы|а)?|s|sec|seconds?)?$/u);
    if(match){
      const duration=Number(match[1].replace(',','.'));
      if(Number.isFinite(duration)&&duration>=1&&duration<=10)return duration;
    }
  }
  throw new PersonaLocalFrameValidationError(index,'durationSec',
    'ожидается числовая длительность 1–10 секунд без диапазонов и приблизительных значений',value);
}
export function normalizePersonaLocalScenarioBeats(value){
  if(!Array.isArray(value)||value.length<3||value.length>12)
    throw Error('Модель вернула неполный сценарий: требуется от 3 до 12 кадров.');
  const corrections=[];
  const beats=value.map((beat,i)=>{
    const index=i+1;
    if(!beat||typeof beat!=='object'||Array.isArray(beat))
      throw new PersonaLocalFrameValidationError(index,'beat','ожидается объект кадра',beat);
    const durationSec=normalizeDuration(beat.durationSec,index);
    const framing=normalizeFraming(beat.framing,index);
    if(durationSec!==beat.durationSec)corrections.push({
      frameNumber:index,field:'durationSec',before:beat.durationSec,after:durationSec,
      reason:'однозначное приведение времени к секундам'
    });
    if(framing!==beat.framing)corrections.push({
      frameNumber:index,field:'framing',before:beat.framing,after:framing,
      reason:'явный перевод синонима в допустимое обозначение плана'
    });
    return {...beat,durationSec,framing};
  });
  return {beats,corrections};
}
