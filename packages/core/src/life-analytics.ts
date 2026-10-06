export type LifeMetric='task_planned'|'task_completed'|'task_on_time'|'task_moved'|'deep_work_minutes'|'sleep_minutes'|'energy'|'mood'|'focus'|'work_quality'|'wellbeing'|'day_satisfaction';
export type LifeObservationSource='life_os'|'user'|'calendar'|'health'|'integration'|'derived';

export interface LifeObservation{
  id:string;
  occurredAt:string;
  localDate:string;
  source:LifeObservationSource;
  metric:LifeMetric;
  value:number;
  category?:string;
  projectId?:string;
  confidence?:number;
}

export interface DailyLifeAggregate{
  date:string;
  planned:number;
  completed:number;
  onTime:number;
  moved:number;
  deepWorkMinutes:number;
  sleepMinutes:number|null;
  energyAverage:number|null;
}

export interface LifeAnalyticsInsight{
  kind:'association'|'pattern';
  statement:string;
  sampleSize:number;
  causal:false;
}

export interface LifeAnalyticsSummary{
  rangeDays:number;
  execution:{planned:number;completed:number;completionRate:number;onTime:number;onTimeRate:number;moved:number;moveRate:number};
  deepWorkMinutes:number;
  sleep:{samples:number;averageMinutes:number|null};
  energy:{samples:number;average:number|null};
  days:DailyLifeAggregate[];
  insights:LifeAnalyticsInsight[];
  dataQuality:{observationCount:number;daysObserved:number;correlationReady:boolean};
}

export function buildLifeAnalyticsSummary(observations:LifeObservation[],rangeDays=30):LifeAnalyticsSummary{
  const safe=observations.filter(validObservation);
  const planned=sumMetric(safe,'task_planned'),completed=sumMetric(safe,'task_completed'),onTime=sumMetric(safe,'task_on_time'),moved=sumMetric(safe,'task_moved');
  const sleep=values(safe,'sleep_minutes'),energy=values(safe,'energy');
  const byDate=new Map<string,LifeObservation[]>();
  for(const item of safe){const list=byDate.get(item.localDate)??[];list.push(item);byDate.set(item.localDate,list)}
  const days=[...byDate.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([date,list])=>({
    date,
    planned:sumMetric(list,'task_planned'),
    completed:sumMetric(list,'task_completed'),
    onTime:sumMetric(list,'task_on_time'),
    moved:sumMetric(list,'task_moved'),
    deepWorkMinutes:sumMetric(list,'deep_work_minutes'),
    sleepMinutes:nullableAverage(values(list,'sleep_minutes')),
    energyAverage:nullableAverage(values(list,'energy')),
  }));
  const correlationReady=pairedDayCount(days)>=7;
  return{
    rangeDays:Math.max(1,Math.round(rangeDays)),
    execution:{planned,completed,completionRate:rate(completed,planned),onTime,onTimeRate:rate(onTime,planned),moved,moveRate:rate(moved,planned)},
    deepWorkMinutes:sumMetric(safe,'deep_work_minutes'),
    sleep:{samples:sleep.length,averageMinutes:nullableAverage(sleep)},
    energy:{samples:energy.length,average:nullableAverage(energy)},
    days,
    insights:[],
    dataQuality:{observationCount:safe.length,daysObserved:days.length,correlationReady},
  };
}

function validObservation(value:LifeObservation){return Boolean(value&&value.id&&/^\d{4}-\d{2}-\d{2}$/.test(value.localDate)&&Number.isFinite(value.value)&&value.value>=0)}
function values(items:LifeObservation[],metric:LifeMetric){return items.filter(x=>x.metric===metric).map(x=>x.value)}
function sumMetric(items:LifeObservation[],metric:LifeMetric){return values(items,metric).reduce((a,b)=>a+b,0)}
function nullableAverage(list:number[]){return list.length?round(list.reduce((a,b)=>a+b,0)/list.length):null}
function rate(value:number,total:number){return total?Math.round(value/total*100):0}
function round(value:number){return Math.round(value*10)/10}
function pairedDayCount(days:DailyLifeAggregate[]){return days.filter(x=>x.sleepMinutes!==null&&x.energyAverage!==null).length}
