/** Life OS owns observation history; Persona consumes evidence, never inferred approval. */
export const PUBLICATION_ANALYTICS_KEY='lifeos:content:publication-analytics:v1';
export type MetricSnapshot={version:1;provider:'metricool';platform:'instagram';url:string;publishedAt:string|null;observedAt:string;format:'carousel'|'photo'|'reel';contentId:string|null;views:number|null;reach:number|null;likes:number|null;comments:number|null;saves:number|null;shares:number|null;follows:number|null};
const fields=['views','reach','likes','comments','saves','shares','follows'] as const;
const instant=(s:unknown):s is string=>typeof s==='string'&&/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s)&&Number.isFinite(Date.parse(s));
export function validatePublicationAnalytics(value:unknown):MetricSnapshot[]{
 if(!Array.isArray(value)||value.length>3000)throw Error('Некорректная история статистики');
 const keys=new Set<string>(),bindings=new Map<string,string>();
 for(const item of value){
  const r=item as MetricSnapshot;
  if(!r||r.version!==1||r.provider!=='metricool'||r.platform!=='instagram'||typeof r.url!=='string'||!/^https:\/\/www\.instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]{3,80}\/$/.test(r.url)||
   !instant(r.observedAt)||(r.publishedAt!==null&&(!instant(r.publishedAt)||Date.parse(r.publishedAt)>Date.parse(r.observedAt)))||!['carousel','photo','reel'].includes(r.format)||
   (r.contentId!==null&&(typeof r.contentId!=='string'||!/^[-A-Za-z0-9]{3,75}$/.test(r.contentId)))||
   fields.some(k=>r[k]!==null&&(!Number.isSafeInteger(r[k])||r[k]!<0)))throw Error('Некорректная запись Metricool');
  const key=r.url+'|'+Date.parse(r.observedAt);
  if(keys.has(key))throw Error('Повторное наблюдение');keys.add(key);
  if(r.contentId!==null){const prior=bindings.get(r.url);if(prior&&prior!==r.contentId)throw Error('Конфликт привязки публикации');bindings.set(r.url,r.contentId)}
 }
 return value as MetricSnapshot[];
}
export function loadPublicationAnalytics(storage:Pick<Storage,'getItem'>):MetricSnapshot[]{
 const raw=storage.getItem(PUBLICATION_ANALYTICS_KEY);return raw===null?[]:validatePublicationAnalytics(JSON.parse(raw));
}
const fingerprint=(r:MetricSnapshot)=>JSON.stringify([r.version,r.provider,r.platform,r.url,r.publishedAt===null?null:Date.parse(r.publishedAt),Date.parse(r.observedAt),r.format,...fields.map(k=>r[k])]);
export function mergePublicationAnalytics(current:MetricSnapshot[],incoming:MetricSnapshot[]):MetricSnapshot[]{
 validatePublicationAnalytics(current);validatePublicationAnalytics(incoming);
 const records=new Map(current.map(r=>[r.url+'|'+Date.parse(r.observedAt),r]));
 for(const r of incoming){const key=r.url+'|'+Date.parse(r.observedAt),old=records.get(key);
  if(old&&(fingerprint(old)!==fingerprint(r)||(old.contentId&&r.contentId&&old.contentId!==r.contentId)))throw Error('Конфликт снимка статистики; исходные записи сохранены');
  records.set(key,old?{...old,contentId:old.contentId??r.contentId}:r);
 }
 const result=[...records.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt)||a.url.localeCompare(b.url));
 return validatePublicationAnalytics(result);
}
export function importPublicationAnalytics(storage:Pick<Storage,'getItem'|'setItem'>,incoming:unknown){
 const result=mergePublicationAnalytics(loadPublicationAnalytics(storage),validatePublicationAnalytics(incoming));
 storage.setItem(PUBLICATION_ANALYTICS_KEY,JSON.stringify(result));return result;
}
export function bindPublication(storage:Pick<Storage,'getItem'|'setItem'>,url:string,contentId:string){
 const rows=loadPublicationAnalytics(storage);
 if(!rows.some(r=>r.url===url)||rows.some(r=>r.url===url&&r.contentId!==null&&r.contentId!==contentId))throw Error('Публикация отсутствует или уже привязана');
 const result=validatePublicationAnalytics(rows.map(r=>r.url===url?{...r,contentId}:r));
 storage.setItem(PUBLICATION_ANALYTICS_KEY,JSON.stringify(result));return result;
}
export function publicationLearning(rows:MetricSnapshot[]){
 validatePublicationAnalytics(rows);
 const groups=new Map<string,MetricSnapshot[]>();
 for(const row of [...rows].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt))){const list=groups.get(row.url)??[];list.push(row);groups.set(row.url,list)}
 return [...groups.values()].map(history=>{
  const latest=history[history.length-1],previous=history[history.length-2];
  const interactions=[latest.likes,latest.comments,latest.saves,latest.shares];
  const engagement=latest.reach&&interactions.every(n=>n!==null)?100*interactions.reduce<number>((n,v)=>n+(v??0),0)/latest.reach:null;
  const unchanged=Boolean(previous&&fields.every(k=>previous[k]===latest[k]));
  return {latest,history,contentId:history.find(r=>r.contentId!==null)?.contentId??null,engagement,viewsPerReach:latest.reach&&latest.views!==null?latest.views/latest.reach:null,
   unchanged,ageHours:latest.publishedAt===null?null:(Date.parse(latest.observedAt)-Date.parse(latest.publishedAt))/3600000,
   status:'OBSERVATION_ONLY' as const,hypotheses:latest.saves===0&&latest.shares===0?['Проверить полезность и желание поделиться; причина не установлена.']:[],
   limitations:'Время запроса не равно времени обновления провайдера. Просмотры не измеряют дочитывание; метрики не доказывают причину результата.'};
 });
}

/** Select one next experiment, not a ranking or a learned causal claim.
 * Comparisons across formats and unknown observation ages are excluded. */
export function editorialExperiment(rows:MetricSnapshot[],format:MetricSnapshot['format']){
 const observations=publicationLearning(rows).filter(r=>r.latest.format===format);
 const eligible=observations.filter(r=>r.ageHours!==null&&r.ageHours>=24&&r.ageHours<=72&&
  r.latest.reach!==null&&r.latest.reach>0&&r.latest.saves!==null&&r.latest.shares!==null);
 const bound=eligible.filter(r=>r.contentId!==null);
 const weak=eligible.filter(r=>r.latest.saves===0&&r.latest.shares===0);
 const status=eligible.length===0?'INSUFFICIENT_EVIDENCE':'EXPERIMENT_ONLY';
 return {status,format,observedPosts:observations.length,comparablePosts:eligible.length,boundPosts:bound.length,
  evidence:eligible.map(r=>({url:r.latest.url,contentId:r.contentId,observedAt:r.latest.observedAt,ageHours:r.ageHours,reach:r.latest.reach,saves:r.latest.saves,shares:r.latest.shares})),
  experiment:weak.length?'Проверить один конкретный повод сохранить или переслать материал: профессиональное наблюдение, которое читатель сможет использовать.':'Зафиксировать исходные результаты и повторить наблюдение в одинаковом временном окне.',
  guardrails:['Не менять эстетику бренда по одному посту.','Не считать просмотры дочитываниями.','Не менять одновременно тему, обложку, время выхода и формат ради эксперимента.','Не добавлять непроверенные факты или выдуманный личный опыт.'],
  automaticStrategyChange:false,publicationApproved:false};
}
