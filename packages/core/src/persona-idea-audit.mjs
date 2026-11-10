/** Shared selection policy. Scores are editorial opinions, not audience metrics. */
export const IDEA_AUDIT_CRITERIA=Object.freeze(['visuality','actingRange','sellingPotential','hook']);
const fail=message=>{throw Error('Persona idea audit: '+message)};
export function auditCriteria(version=1){
 if(version===1)return IDEA_AUDIT_CRITERIA;
 if(version===2)return IDEA_AUDIT_CRITERIA.filter(k=>k!=='hook');
 fail('Unsupported audit version');
}
export function readIdeaProductionPackage(value){
 const shape={visualStyle:['lighting','colors'],musicalLeitmotif:['instruments','climax'],editingRhythm:['cuts','pauses']};
 if(!value||typeof value!=='object'||Object.keys(value).length!==3)fail('Incomplete production package');
 const result={};
 for(const [key,fields] of Object.entries(shape)){
  const section=value[key];if(!section||typeof section!=='object'||Object.keys(section).length!==2)fail('Incomplete production package: '+key);
  result[key]={};for(const field of fields){if(typeof section[field]!=='string'||section[field].trim().length<4||section[field].length>220)fail('Invalid production package: '+key+'.'+field);result[key][field]=section[field].trim()}
 }
 return result;
}
export function evaluateIdeaAudit(ideas,reply,{version=1}={}){
 const criteria=auditCriteria(version);
 if(!Array.isArray(ideas)||ideas.length!==5||ideas.some(i=>!i||typeof i.id!=='string'||!i.id||typeof i.title!=='string'||!i.title.trim()||i.title.length>140)||new Set(ideas.map(i=>i.id)).size!==5)fail('Expected five unique draft identities');
 if(!Array.isArray(reply?.reviews)||reply.reviews.length!==5)fail('Critic must review every draft exactly once');
 const seen=new Set();
 for(const r of reply.reviews){
  if(!r||!ideas.some(i=>i.id===r.ideaId)||seen.has(r.ideaId)||typeof r.banal!=='boolean'||typeof r.showsActing!=='boolean'||typeof r.reason!=='string'||r.reason.trim().length<12||r.reason.length>1000||!r.scores||Object.keys(r.scores).length!==criteria.length||criteria.some(k=>!Number.isInteger(r.scores[k])||r.scores[k]<1||r.scores[k]>10))fail('Invalid, missing or duplicated critic review');
  seen.add(r.ideaId);
 }
 const reviews=ideas.map(idea=>{
  const row=reply.reviews.find(r=>r.ideaId===idea.id),modelScores=Object.fromEntries(criteria.map(k=>[k,row.scores[k]])),scores={...modelScores},appliedRules=[];
  if(row.banal){scores[version===1?'hook':'sellingPotential']=1;appliedRules.push(version===1?'Банальная идея: хук = 1 по обязательному правилу.':'Банальная идея: продающий потенциал = 1 по обязательному правилу.')}
  if(!row.showsActing){scores.actingRange=1;appliedRules.push('Нет демонстрации актёрской игры: диапазон = 1.')}
  const average=criteria.reduce((n,k)=>n+scores[k],0)/criteria.length;
  return {ideaId:idea.id,title:idea.title,modelScores,scores,average,banal:row.banal,showsActing:row.showsActing,reason:row.reason.trim(),appliedRules,decision:average<8?'below_threshold':'outside_top_two'};
 });
 const qualified=reviews.filter(r=>r.average>=8).sort((a,b)=>b.average-a.average),selectedIdeaIds=qualified.slice(0,2).map(r=>r.ideaId);
 for(const r of reviews)if(selectedIdeaIds.includes(r.ideaId))r.decision='selected';
 return {version,kind:'persona-generator-critic-v'+version,threshold:8,limit:2,selectedIdeaIds,reviews,rawResponse:structuredClone(reply)};
}
export function verifyIdeaAudit(audit,ideas){
 if(!audit||!Array.isArray(audit.reviews))fail('Missing persisted critic audit');
 const computed=evaluateIdeaAudit(ideas??audit.reviews.map(r=>({id:r.ideaId,title:r.title})),audit.rawResponse,{version:audit.version});
 for(const key of ['version','kind','threshold','limit','selectedIdeaIds','reviews'])if(JSON.stringify(audit[key])!==JSON.stringify(computed[key]))fail('Persisted audit differs from computed scores or selection');
 return computed;
}
