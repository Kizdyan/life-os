/** Shared selection policy. Scores are editorial opinions, not audience metrics. */
export const IDEA_AUDIT_CRITERIA=Object.freeze(['visuality','actingRange','sellingPotential','hook']);
const fail=message=>{throw Error('Persona idea audit: '+message)};
export function evaluateIdeaAudit(ideas,reply){
 if(!Array.isArray(ideas)||ideas.length!==5||ideas.some(i=>!i||typeof i.id!=='string'||!i.id||typeof i.title!=='string'||!i.title.trim()||i.title.length>140)||new Set(ideas.map(i=>i.id)).size!==5)fail('Expected five unique draft identities');
 if(!Array.isArray(reply?.reviews)||reply.reviews.length!==5)fail('Critic must review every draft exactly once');
 const seen=new Set();
 for(const r of reply.reviews){
  if(!r||!ideas.some(i=>i.id===r.ideaId)||seen.has(r.ideaId)||typeof r.banal!=='boolean'||typeof r.showsActing!=='boolean'||typeof r.reason!=='string'||r.reason.trim().length<12||r.reason.length>1000||!r.scores||Object.keys(r.scores).length!==4||IDEA_AUDIT_CRITERIA.some(k=>!Number.isInteger(r.scores[k])||r.scores[k]<1||r.scores[k]>10))fail('Invalid, missing or duplicated critic review');
  seen.add(r.ideaId);
 }
 const reviews=ideas.map(idea=>{
  const row=reply.reviews.find(r=>r.ideaId===idea.id),modelScores=Object.fromEntries(IDEA_AUDIT_CRITERIA.map(k=>[k,row.scores[k]])),scores={...modelScores},appliedRules=[];
  if(row.banal){scores.hook=1;appliedRules.push('Банальная идея: хук = 1 по обязательному правилу.')}
  if(!row.showsActing){scores.actingRange=1;appliedRules.push('Нет демонстрации актёрской игры: диапазон = 1.')}
  const average=IDEA_AUDIT_CRITERIA.reduce((n,k)=>n+scores[k],0)/4;
  return {ideaId:idea.id,title:idea.title,modelScores,scores,average,banal:row.banal,showsActing:row.showsActing,reason:row.reason.trim(),appliedRules,decision:average<8?'below_threshold':'outside_top_two'};
 });
 const qualified=reviews.filter(r=>r.average>=8).sort((a,b)=>b.average-a.average),selectedIdeaIds=qualified.slice(0,2).map(r=>r.ideaId);
 for(const r of reviews)if(selectedIdeaIds.includes(r.ideaId))r.decision='selected';
 return {version:1,kind:'persona-generator-critic-v1',threshold:8,limit:2,selectedIdeaIds,reviews,rawResponse:structuredClone(reply)};
}
export function verifyIdeaAudit(audit,ideas){
 if(!audit||!Array.isArray(audit.reviews))fail('Missing persisted critic audit');
 const computed=evaluateIdeaAudit(ideas??audit.reviews.map(r=>({id:r.ideaId,title:r.title})),audit.rawResponse);
 for(const key of ['version','kind','threshold','limit','selectedIdeaIds','reviews'])if(JSON.stringify(audit[key])!==JSON.stringify(computed[key]))fail('Persisted audit differs from computed scores or selection');
 return computed;
}
