export type DiscourseItemKind='event'|'task'|'travel'|'meal';
export type DiscourseRelationType='before'|'after'|'after_actual_end';

export interface DiscourseRelation{
  type:DiscourseRelationType;
  targetKey:string;
}

export interface DiscourseConstraint{
  type:'before'|'after';
  targetKey:string;
}

export interface ErikaDiscourseItem{
  key:string;
  title:string;
  kind:DiscourseItemKind;
  date:string|null;
  startTime:string|null;
  endTime:string|null;
  fixed:boolean;
  relation:DiscourseRelation|null;
  constraints:DiscourseConstraint[];
  condition:string|null;
  eventSubtype:'theatre_ordinary'|'performance'|null;
  sourceClause:string;
}

export interface ErikaDiscourseParse{
  dateContext:string|null;
  items:ErikaDiscourseItem[];
  ambiguities:string[];
  uncoveredClauses:string[];
}

export interface ErikaDiscourseContext{
  today:string;
}

interface Clause{
  text:string;
  date:string|null;
}

export function parseErikaDiscourse(
  text:string,
  context:ErikaDiscourseContext,
):ErikaDiscourseParse{
  const rawClauses=semanticClauses(text);
  let dateContext:string|null=null;
  const clauses:Clause[]=rawClauses.map(raw=>{
    if(/\bсегодня\b/i.test(raw))dateContext=context.today;
    if(/\bзавтра\b/i.test(raw))dateContext=addDays(context.today,1);
    return{text:raw,date:dateContext};
  });

  const items:ErikaDiscourseItem[]=[];
  const ambiguities:string[]=[];
  const uncoveredClauses:string[]=[];

  const theatreClause=clauses.find(clause=>isTheatreClause(clause.text));
  const theatreTime=theatreClause?extractTime(theatreClause.text):null;
  const theatreKey=theatreClause?'theatre':null;

  for(const clause of clauses){
    const source=clause.text;

    if(hasUnresolvedPronounReference(source)){
      ambiguities.push(source);
      continue;
    }

    if(isConditionalDaughterTrip(source)){ 
      if(!theatreKey){
        ambiguities.push(source);
        continue;
      }
      items.push({
        key:'daughter-trip',
        title:'Поехать к дочке',
        kind:'travel',
        date:clause.date??theatreClause?.date??null,
        startTime:null,
        endTime:null,
        fixed:false,
        relation:{type:'after_actual_end',targetKey:theatreKey},
        constraints:[],
        condition:extractCondition(source),
        eventSubtype:null,
        sourceClause:source,
      });
      continue;
    }

    if(isTheatreClause(source)){
      const startTime=extractTime(source);
      if(!startTime){
        ambiguities.push(source);
        continue;
      }
      const performance=isExplicitPerformance(source);
      items.push({
        key:'theatre',
        title:performance?'Спектакль':'Театр',
        kind:'event',
        date:clause.date,
        startTime,
        endTime:null,
        fixed:true,
        relation:null,
        constraints:[],
        condition:null,
        eventSubtype:performance?'performance':'theatre_ordinary',
        sourceClause:source,
      });
      continue;
    }

    if(isDepartureClause(source)){
      const startTime=extractTime(source);
      if(!startTime||!theatreKey||!theatreTime){
        ambiguities.push(source);
        continue;
      }
      items.push({
        key:'theatre-departure',
        title:'Выйти в театр',
        kind:'travel',
        date:clause.date??theatreClause?.date??null,
        startTime,
        endTime:theatreTime,
        fixed:true,
        relation:{type:'before',targetKey:theatreKey},
        constraints:[],
        condition:null,
        eventSubtype:null,
        sourceClause:source,
      });
      continue;
    }

    if(isGymClause(source)){
      items.push({
        key:'gym',
        title:'Зал',
        kind:'task',
        date:clause.date,
        startTime:null,
        endTime:null,
        fixed:false,
        relation:theatreKey?{type:'before',targetKey:theatreKey}:null,
        constraints:[],
        condition:null,
        eventSubtype:null,
        sourceClause:source,
      });
      continue;
    }

    if(isMealClause(source)){
      const gym=items.find(item=>item.key==='gym');
      items.push({
        key:'meal',
        title:'Поесть',
        kind:'meal',
        date:clause.date,
        startTime:null,
        endTime:null,
        fixed:false,
        relation:gym?{type:'after',targetKey:gym.key}:null,
        constraints:theatreKey?[{type:'before',targetKey:theatreKey}]:[],
        condition:null,
        eventSubtype:null,
        sourceClause:source,
      });
      continue;
    }

    if(isCallDashaClause(source)){
      items.push({
        key:'call-dasha',
        title:'Позвонить Даше',
        kind:'task',
        date:clause.date,
        startTime:extractTime(source),
        endTime:null,
        fixed:Boolean(extractTime(source)),
        relation:null,
        constraints:[],
        condition:null,
        eventSubtype:null,
        sourceClause:source,
      });
      continue;
    }

    if(source.trim())uncoveredClauses.push(source);
  }

  return{
    dateContext,
    items:dedupeByKey(items),
    ambiguities,
    uncoveredClauses,
  };
}

function semanticClauses(text:string):string[]{
  const sentences=text
    .split(/[.!?]+/)
    .map(value=>value.trim())
    .filter(Boolean);
  const clauses:string[]=[];
  for(const sentence of sentences){
    if(/\bпотом\b/i.test(sentence)&&!/^после\s+театр/i.test(sentence)){
      const pieces=sentence.split(/\s*,?\s*\bпотом\b\s*/i).map(value=>value.trim()).filter(Boolean);
      clauses.push(...pieces);
    }else{
      clauses.push(sentence.replace(/,$/,'').trim());
    }
  }
  return clauses;
}

function isTheatreClause(text:string):boolean{
  return /\bтеатр\b/i.test(text)&&Boolean(extractTime(text))&&!/^до\s+театр/i.test(text)&&!/^после\s+театр/i.test(text);
}

function isExplicitPerformance(text:string):boolean{
  return /\b(спектакл\w*|показ\w*|выступлен\w*)\b/i.test(text);
}

function isDepartureClause(text:string):boolean{
  return /\bвыйти\b/i.test(text)&&Boolean(extractTime(text));
}

function isGymClause(text:string):boolean{
  return /\bзал\b|тренировк\w*/i.test(text)&&!/после\s+зал/i.test(text);
}

function isMealClause(text:string):boolean{
  return /\bпоесть\b|\bпокушать\b|\bобед\w*\b|\bужин\w*\b/i.test(text);
}

function isCallDashaClause(text:string):boolean{
  return /позвонить\s+даш\w*/i.test(text);
}

function isConditionalDaughterTrip(text:string):boolean{
  return /^после\s+театр/i.test(text)&&/(?:поехать|ехать)\s+к\s+дочк/i.test(text);
}

function hasUnresolvedPronounReference(text:string):boolean{
  return /^после\s+(него|не[её]|этого)\b/i.test(text);
}

function extractCondition(text:string):string|null{
  const match=text.match(/\bесли\s+(.+?)(?=,\s*(?:поехать|ехать)|$)/i);
  return match?`если ${match[1].trim()}`:null;
}

function extractTime(text:string):string|null{
  const match=text.match(/(?:\bв\b|\bк\b)?\s*(\d{1,2}):(\d{2})/);
  if(!match)return null;
  const hours=Number(match[1]),minutes=Number(match[2]);
  if(hours<0||hours>23||minutes<0||minutes>59)return null;
  return`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}`;
}

function addDays(date:string,days:number):string{
  const value=new Date(`${date}T12:00:00Z`);
  if(Number.isNaN(value.getTime()))throw new Error('Invalid discourse context date');
  value.setUTCDate(value.getUTCDate()+days);
  return value.toISOString().slice(0,10);
}

function dedupeByKey(items:ErikaDiscourseItem[]):ErikaDiscourseItem[]{
  const seen=new Set<string>();
  return items.filter(item=>{
    if(seen.has(item.key))return false;
    seen.add(item.key);
    return true;
  });
}
