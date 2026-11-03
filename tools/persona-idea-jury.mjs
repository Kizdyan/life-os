#!/usr/bin/env node
/**
 * Persona independent local multimodel creative jury.
 *
 * Requires TWO distinct, explicitly installed model IDs, configured by author.
 * Pass 1: independently evaluate ALL saved ideas without seeing peers' verdicts.
 * Pass 2: each model sees the other independently authored verdicts and
 *         responds to disagreements. Honest evidence limits, no trends invented.
 *
 * Never chooses an idea on behalf of the author, publishes, or modifies originals.
 */
import {createHash} from 'node:crypto';
import {access,mkdir,readFile} from 'node:fs/promises';
import {writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {modelJSON,validateIdeas,validateModelServers} from './persona-flow.mjs';

const fail=m=>{throw Error('Persona jury: '+m)};
const txt=(v,min,max)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max;
const roles=new Set(['producer','dramaturg','skeptic']);
const votes=new Set(['advance','revise','reject']);
const crossVotes=new Set(['agree','partial','challenge']);
const hash=s=>createHash('sha256').update(s).digest('hex');
async function absent(path){
 await access(path).then(()=>fail('Output directory already exists'),e=>{
  if(e?.code!=='ENOENT')throw e;
 });
}
export function validateJudgeConfig(config){
 if(!Array.isArray(config)||config.length<2||config.length>3)
  fail('Independent jury requires two or three separately configured judge models');
 const rolesSeen=new Set(),modelsSeen=new Set(),servers=[];
 for(const [i,j] of config.entries()){
  if(!j||typeof j!=='object'||Array.isArray(j)||!roles.has(j.role)||
   rolesSeen.has(j.role)||!j.server)fail('Invalid or duplicated judge role at '+i);
  rolesSeen.add(j.role);servers.push(j.server);
  if(typeof j.server.model!=='string'||!j.server.model.trim())fail('Missing judge model');
  const key=j.server.model.trim().toLowerCase();
  if(modelsSeen.has(key))fail('Different prompts on the SAME model do not create independent AI judges');
  modelsSeen.add(key);
 }
 const verified=validateModelServers(servers);
 for(const server of verified){
  const url=new URL(server.origin);
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))
   fail('Until author permits private-data transfer, jury models must run on local loopback');
 }
 return config.map((j,i)=>({role:j.role,server:servers[i]}));
}
function validateSavedProposal(proposal){
 if(proposal?.kind!=='persona-idea-proposal-v1'||proposal.version!==1||
  proposal.status!=='AWAITING_AUTHOR_IDEA_SELECTION'||proposal.publicationApproved!==false||
  proposal.selectedIdeaId!==null||proposal.screenplayGenerated!==false||
  !txt(proposal.theme,8,700)||!txt(proposal.style,3,30))
  fail('Expected a saved, unselected real Persona proposal');
 const ideas=validateIdeas(proposal);
 if(ideas.some((idea,i)=>proposal.ideas[i].id!==idea.id||
  proposal.ideas[i].format!=='reel'))fail('Saved idea IDs/format have changed');
 return ideas;
}
function reviewSystem(role){
 const perspective={
  producer:'Ты профессиональный продюсер творческого автора. Оценивай ясность хука, соответствие актёрскому и музыкальному профилю, потенциальный интерес и производственные затраты. Реальная статистика аккаунтов не предоставлена — НЕ делай вид, что знаешь алгоритмы Instagram, тренды, просмотры и конкурентов.',
  dramaturg:'Ты независимый драматург и сценарный редактор. Проверяй конфликт, действие, уникальность, развитие, первую секунду и финальный поворот. Не подменяй драматургическую критику общими комплиментами.',
  skeptic:'Ты независимый скептический редактор. Ищи предсказуемость, штампы, нереалистичные съёмки, повторяемость и слабую связь с актёрским, музыкальным и режиссёрским диапазоном. Аргументируй конкретно.',
 }[role];
 return perspective+
  ' Важно: это РЕДАКЦИОННОЕ МНЕНИЕ, не прогноз популярности. Ты НЕ видел реальные видео и статистику.'+
  ' Для КАЖДОЙ полученной идеи верни JSON {"verdicts":[{"ideaId":"idea-1","decision":"advance|revise|reject","score":1,"reason":"...","risk":"...","improvement":"..."}]}. Одна запись на каждый ID, балл от 1 до 5. Причины и улучшения конкретные, не повторяйся.';
}
const CROSS_SYSTEM='Ты проводишь ВТОРОЙ раунд независимого редакционного спора. Теперь видишь сохранённые заключения ДРУГИХ моделей. Проверь их конкретные сомнения и при необходимости измени своё мнение. Нельзя утверждать, что просмотры, Instagram Insights или тренды проверены, если источники не предоставлены. Для каждого ID ответь JSON {"responses":[{"ideaId":"idea-1","position":"agree|partial|challenge","why":"...","nextEdit":"..."}]}. Нужны содержательные аргументы, а не повтор чужих оценок.';
function checkIdList(rows,ideas,key,label){
 if(!Array.isArray(rows)||rows.length!==ideas.length)fail(label+' must cover every candidate exactly once');
 const ids=ideas.map(i=>i.id),seen=new Set();
 for(const x of rows){
  if(!x||typeof x!=='object'||!ids.includes(x.ideaId)||seen.has(x.ideaId))
   fail(label+' missing or repeated candidate ID');
  seen.add(x.ideaId);
 }
 return rows.sort((a,b)=>ids.indexOf(a.ideaId)-ids.indexOf(b.ideaId));
}
export function validateVerdicts(reply,ideas){
 const result=checkIdList(reply?.verdicts,ideas,'verdicts','Judge review');
 for(const v of result)if(!votes.has(v.decision)||
  !Number.isInteger(v.score)||v.score<1||v.score>5||
  !txt(v.reason,20,1000)||!txt(v.risk,12,800)||!txt(v.improvement,12,800))
  fail('Invalid or generic judge verdict for '+v.ideaId);
 return result;
}
export function validateCrossReview(reply,ideas){
 const result=checkIdList(reply?.responses,ideas,'responses','Cross-examination');
 for(const v of result)if(!crossVotes.has(v.position)||
  !txt(v.why,20,1000)||!txt(v.nextEdit,12,800))
  fail('Insufficient cross-examination of '+v.ideaId);
 return result;
}
export function buildJurySummary(ideas,firstPass,secondPass){
 return ideas.map(idea=>{
  const verdicts=firstPass.map(p=>({role:p.role,provider:p.provider,
   ...p.verdicts.find(v=>v.ideaId===idea.id)}));
  const critiques=secondPass.map(p=>({role:p.role,provider:p.provider,
   ...p.responses.find(v=>v.ideaId===idea.id)}));
  const scores=verdicts.map(v=>v.score),decisions=verdicts.map(v=>v.decision);
  return {ideaId:idea.id,title:idea.title,editorialMeanScore:Number(
   (scores.reduce((s,x)=>s+x,0)/scores.length).toFixed(2)),
   decisionDisagreement:new Set(decisions).size>1,
   scoreSpread:Math.max(...scores)-Math.min(...scores),
   authorDecisionRequired:true,verdicts,critiques,
   note:'Scores are model opinions on text only, not measured reach or likelihood of virality.'};
 });
}
export async function judgePersonaIdeas({
 proposalPath,outputDir,judges,creatorProfilePath,fetchImpl=fetch,
}={}){
 if(!txt(proposalPath,1,1000)||!txt(outputDir,1,1000))
  fail('Saved proposal and NEW report directory required');
 const reviewers=validateJudgeConfig(judges);
 const file=resolve(proposalPath),source=await readFile(file,'utf8');
 const proposal=JSON.parse(source),ideas=validateSavedProposal(proposal);
 const out=resolve(outputDir);await absent(out);
 let profile=null,profileSha256=null;
 if(creatorProfilePath){
  const profileRaw=await readFile(resolve(creatorProfilePath),'utf8');
  if(profileRaw.length>25000)fail('Creator profile exceeds safe local prompt size');
  profile=JSON.parse(profileRaw);
  if(!profile||typeof profile!=='object'||Array.isArray(profile))
   fail('Creator profile must be a JSON object');
  profileSha256=hash(profileRaw);
 }
 // Serial execution avoids loading multiple large Ollama models into limited Windows RAM.
 // Independent first pass still contains NO peer verdicts.
 const firstPass=[];
 for(const reviewer of reviewers){
  const result=await modelJSON({servers:[reviewer.server],fetchImpl,
   system:reviewSystem(reviewer.role),
   payload:{theme:proposal.theme,style:proposal.style,ideas,
    creatorProfile:profile,evidenceLimits:{
     instagramInsights:false,liveTrends:false,actualVideoViewed:false}}});
  firstPass.push({role:reviewer.role,provider:result.provider,
   verdicts:validateVerdicts(result.data,ideas)});
 }
 // Real second pass; every judge sees saved peer opinions, not fabricated consensus.
 const secondPass=[];
 for(const [i,reviewer] of reviewers.entries()){
  const own=firstPass[i],peers=firstPass.filter((_,j)=>j!==i);
  if(peers.length<1)fail('Cannot cross-examine without a second model');
  const result=await modelJSON({servers:[reviewer.server],fetchImpl,system:CROSS_SYSTEM,
   payload:{theme:proposal.theme,ideas,ownVerdicts:own.verdicts,
    independentPeerVerdicts:peers.map(p=>({
     role:p.role,provider:p.provider,verdicts:p.verdicts})),
    evidenceLimits:{instagramInsights:false,liveTrends:false,actualVideoViewed:false}}});
  secondPass.push({role:reviewer.role,provider:result.provider,
   responses:validateCrossReview(result.data,ideas)});
 }
 const summary=buildJurySummary(ideas,firstPass,secondPass);
 const report={version:1,kind:'persona-independent-idea-jury-v1',
  status:'AWAITING_AUTHOR_IDEA_SELECTION',
  proposalFile:file,proposalSha256:hash(source),creatorProfileSha256:profileSha256,
  generatedAt:new Date().toISOString(),models:reviewers.map(x=>({
   role:x.role,model:x.server.model,serverId:x.server.id})),
  independence:{differentModelIds:true,firstPassBlindToPeers:true,
   secondPassCrossExamination:true,localOnly:true},
  evidenceLimits:{instagramInsights:'NOT_CONNECTED',liveTrends:'NOT_VERIFIED',
   userFootage:'NOT_EVALUATED'},
  firstPass,secondPass,ideas:summary,
  publicationApproved:false,selectionApproved:false,
  note:'The jury scores are subjective editorial assessments, NOT view forecasts. The author explicitly chooses which idea to direct or reject.'};
 const lines=['# Persona — независимый ИИ-совет','',
  '**Статус: решение автора требуется.** Это мнения моделей, не реальные метрики просмотров.','',
  'Два этапа: сначала каждый ИИ судил без чужих оценок, затем отвечал на аргументы остальных.','',
  ...summary.flatMap(item=>[
   '## '+item.ideaId+' · '+item.title,
   'Средняя редакционная оценка: '+item.editorialMeanScore+'/5. Разногласия: '+
    (item.decisionDisagreement?'ДА':'нет')+'.','',
   ...item.verdicts.flatMap(v=>['**'+v.role+' / '+v.provider.model+'** · '+v.decision+
    ' ('+v.score+'/5)',v.reason,'Риск: '+v.risk,'Улучшение: '+v.improvement,'']),
   ...item.critiques.flatMap(v=>['Повторная проверка '+v.role+' ('+v.position+'): '+
    v.why,'Следующая правка: '+v.nextEdit,'']),
  ]),
  'Выбор автора выполняется отдельно через persona:ideas select. Никакой публикации.',''];
 await mkdir(out,{recursive:false});
 await Promise.all([
  writeFile(join(out,'JURY.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'}),
  writeFile(join(out,'JURY.md'),lines.join('\n'),{flag:'wx'}),
 ]);
 return {status:report.status,report:join(out,'JURY.json'),
  readableReport:join(out,'JURY.md'),ideas:ideas.length,
  distinctModels:reviewers.length,modelCalls:reviewers.length*2,
  publicationApproved:false,authorDecisionRequired:true};
}
const usage='Usage: npm run persona:jury -- "<PROPOSAL_IDEAS.json>" "<JURY_CONFIG.json>" "<NEW_REPORT_DIR>" [CREATOR_PROFILE.json]';
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [proposalPath,configPath,outputDir,creatorProfilePath]=process.argv.slice(2);
 try{
  const cfg=JSON.parse(await readFile(resolve(configPath),'utf8'));
  const report=await judgePersonaIdeas({proposalPath,outputDir,judges:cfg.judges,
   creatorProfilePath});
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
 }catch(e){process.stderr.write(String(e?.message??e)+'\n'+usage+'\n');process.exitCode=1}
}
