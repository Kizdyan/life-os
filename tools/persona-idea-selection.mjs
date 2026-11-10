#!/usr/bin/env node
/**
 * Persona's genuine author decision gate: 1 real model call yields 3–5 ideas;
 * author chooses an ID; 1 later real model call directs ONLY THAT idea.
 *
 * No hidden first-idea choice, no fake judge, no publication or filming claim.
 */
import {createHash} from 'node:crypto';
import {access,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {modelJSON,preparePersonaFlow,validateIdeas,validateModelServers} from './persona-flow.mjs';
import {commercialPrompt,commercialExamplesSha256,readCommercialIdeaDetails,loadArchetype,productionIdeaSchema} from './persona-commercial-prompt.mjs';
import {critiquePersonaIdeas} from './persona-idea-jury.mjs';
import {verifyIdeaAudit} from '../packages/core/src/persona-idea-audit.mjs';

const fail=m=>{throw Error('Persona ideas: '+m)};
const txt=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const styles=new Set(['cinematic','humor','intimate','unexpected']);
const sys='Ты предлагаешь актёру и композитору три разных оригинальных коротких видео. Никаких шаблонных советов, выдуманных личных фактов и повторяющихся хуков. Отвечай ТОЛЬКО JSON формата {"ideas":[{"title":"...","angle":"...","hook":"..."},...]}.';
async function absent(path){
 await access(path).then(()=>fail('Output exists: '+path),e=>{if(e?.code!=='ENOENT')throw e});
}
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function proposePersonaIdeas({
 theme,outputDir,servers,style='cinematic',fetchImpl=fetch,contentFormat=null,ideaCount=3,audit=false,auditVersion=2,
}={}){
 if(!txt(theme,8,700)||!styles.has(style)||!txt(outputDir,1,1000))
  fail('Valid theme, style and fresh output directory required');
 const dir=resolve(outputDir);await absent(dir);
 if(![1,3,5].includes(ideaCount)||!contentFormat&&ideaCount!==3)fail('Commercial counts require an explicit commercial format');
 if(typeof audit!=='boolean'||audit&&(!contentFormat||ideaCount!==5))fail('Generator-Critic requires five commercial drafts');
 if(![1,2].includes(auditVersion))fail('Unsupported idea audit version');
 if(audit&&validateModelServers(servers).some(s=>!['localhost','127.0.0.1','[::1]'].includes(new URL(s.origin).hostname)||/cloud/i.test(s.model)))fail('Generator-Critic requires installed local models only');
 const archetype=contentFormat?loadArchetype():null,fullPackage=audit&&auditVersion===2;
 const system=contentFormat?commercialPrompt(contentFormat,ideaCount,{productionPackage:fullPackage,archetype}):sys;
 const proposalResponse=await modelJSON({servers,fetchImpl,system,streaming:audit,...(fullPackage?{responseSchema:productionIdeaSchema()}:{}),...(contentFormat?{contextTokens:8192,timeoutMs:audit?600000:300000,maxOutputTokens:audit?4000:2200,thinking:false}:{}),
  payload:{theme,style,
   requirements:'one actor; one room; phone + tripod; possible piano; shootable 20–50 sec; character and humor'}});
 let critique=null,created=false,draftIdeas;
 if(audit){await mkdir(dir,{recursive:false});created=true;await writeFile(join(dir,'GENERATOR-RESPONSE.json'),JSON.stringify({data:proposalResponse.data,provider:proposalResponse.provider,archetype,archetypeSha256:sha(JSON.stringify(archetype)),systemPromptSha256:sha(system),publicationApproved:false},null,2),{flag:'wx'})}
 try{draftIdeas=validateIdeas(proposalResponse.data,contentFormat?{count:ideaCount,requireProductionPackage:fullPackage}:{}).map((idea,index)=>contentFormat?{...idea,...readCommercialIdeaDetails(proposalResponse.data.ideas[index])}:idea)}catch(error){
  if(audit){await writeFile(join(dir,'GENERATOR-ERROR.json'),JSON.stringify({error:error.message,selectableIdeas:0,publicationApproved:false}),{flag:'wx'});fail('Generator validation failed; raw evidence: '+dir+'. '+error.message)}throw error;
 }
 if(audit){
  await writeFile(join(dir,'DRAFTS.json'),JSON.stringify({ideas:draftIdeas,provider:proposalResponse.provider,archetype,archetypeSha256:sha(JSON.stringify(archetype)),examplesSha256:commercialExamplesSha256,systemPromptSha256:sha(system),publicationApproved:false},null,2),{flag:'wx'});
  try{
   const sameProvider=servers.filter(s=>s.id===proposalResponse.provider.id&&s.model===proposalResponse.provider.model);
   critique=await critiquePersonaIdeas({ideas:draftIdeas,servers:sameProvider,fetchImpl,version:auditVersion,archetype});
  }catch(error){await writeFile(join(dir,'CRITIC-ERROR.json'),JSON.stringify({error:String(error.message),selectableIdeas:0,publicationApproved:false}),{flag:'wx'});fail('Critic failed; no ideas offered. Draft evidence: '+dir+'. '+error.message)}
 }
 const ideas=critique?critique.selectedIdeaIds.map(id=>draftIdeas.find(i=>i.id===id)):draftIdeas;
 const proposal={version:1,kind:'persona-idea-proposal-v1',status:audit&&!ideas.length?'NO_IDEAS_PASSED_AUDIT':'AWAITING_AUTHOR_IDEA_SELECTION',
  generatedAt:new Date().toISOString(),theme,style,ideas,provider:proposalResponse.provider,
  selectedIdeaId:null,screenplayGenerated:false,publicationApproved:false,
  ...(contentFormat?{contentFormat,ideaCount,archetype,archetypeSha256:sha(JSON.stringify(archetype)),examplesSha256:commercialExamplesSha256,systemPromptSha256:sha(system),modelResponse:proposalResponse.data}:{}),};
 if(critique)Object.assign(proposal,{audit:critique,draftIdeas});
 const markdown=[
  '# Persona — варианты на выбор автора','',
  '**Результат модели, пока без сценариев. Ни одна идея не выбрана.**','',
  ...ideas.flatMap(idea=>[
   '## '+idea.id+' · '+idea.title,'',
   'Хук: '+idea.hook,'',
   'Замысел: '+idea.angle,'',
  ]),
  ...(critique?['## Самокритика Qwen · не независимое жюри','',...critique.reviews.map(r=>r.ideaId+' · '+r.title+' · '+r.average+'/10 · '+r.decision+' — '+r.reason),'']:[]),
  'Выбери ID понравившейся идеи и запусти persona:ideas -- select.','',
 ];
 if(!created)await mkdir(dir,{recursive:false});
 await Promise.all([
  writeFile(join(dir,'IDEAS.json'),JSON.stringify(proposal,null,2)+'\n',{flag:'wx'}),
  writeFile(join(dir,'IDEAS.md'),markdown.join('\n'),{flag:'wx'}),
 ]);
 return {ideasPath:join(dir,'IDEAS.json'),readableIdeas:join(dir,'IDEAS.md'),
  status:proposal.status,ideas:ideas.length,provider:proposalResponse.provider,
  selectedIdeaId:null,publicationApproved:false};
}
export async function selectPersonaIdea({
 proposalPath,ideaId,outputDir,servers,libraryIndexPath,fetchImpl=fetch,
}={}){
 if(!txt(proposalPath,1,1000)||!txt(ideaId,1,120)||!txt(outputDir,1,1000))
  fail('Saved proposal, idea ID and new plan directory required');
 const path=resolve(proposalPath),text=await readFile(path,'utf8'),proposal=JSON.parse(text);
 if(proposal?.version!==1||proposal.kind!=='persona-idea-proposal-v1'||
  proposal.status!=='AWAITING_AUTHOR_IDEA_SELECTION'||proposal.publicationApproved!==false||
  proposal.screenplayGenerated!==false||proposal.selectedIdeaId!==null||
  !txt(proposal.theme,8,700)||!styles.has(proposal.style)||
  !txt(proposal.provider?.id,1,64)||!txt(proposal.provider?.model,1,120))
  fail('Invalid or apparently pre-approved idea proposal');
 let ideas;
 if(proposal.audit){
  if(proposal.audit.version===2&&(!txt(proposal.archetype?.description,8,1500)||proposal.archetype?.version!==1||proposal.archetypeSha256!==sha(JSON.stringify(proposal.archetype))))fail('Saved archetype provenance changed');
  const drafts=validateIdeas({ideas:proposal.draftIdeas},{count:5,requireProductionPackage:proposal.audit.version===2});
  if(drafts.some((i,index)=>i.id!==proposal.draftIdeas[index].id))fail('Audited draft IDs changed');
  const checked=verifyIdeaAudit(proposal.audit,drafts);
  if(proposal.audit.sourceIdeasSha256!==sha(JSON.stringify(drafts))||proposal.audit.provider?.model!==proposal.provider.model||proposal.audit.provider?.id!==proposal.provider.id)fail('Audit provenance changed');
  ideas=checked.selectedIdeaIds.map(id=>drafts.find(i=>i.id===id));
  if(JSON.stringify(ideas)!==JSON.stringify(proposal.ideas))fail('Saved idea list differs from audit winners');
 }else{
  ideas=validateIdeas(proposal,proposal.contentFormat?{count:proposal.ideaCount}:{});
  if(ideas.some((idea,i)=>proposal.ideas[i].id!==idea.id||proposal.ideas[i].format!=='reel'))fail('Saved candidate IDs or formats were changed');
 }
 const chosen=ideas.find(i=>i.id===ideaId);
 if(!chosen)fail('No such candidate in saved real model proposal: '+ideaId);
 const output=resolve(outputDir);await absent(output);
 const result=await preparePersonaFlow({
  theme:proposal.theme,style:proposal.style,outputDir:output,servers,
  libraryIndexPath,fetchImpl,ideasFromProposal:ideas,selectedIdeaId:ideaId,
  ideasProvider:proposal.provider,sourceProposalSha256:sha(text),
  creativeContext:proposal.archetype?{archetype:proposal.archetype,archetypeSha256:proposal.archetypeSha256}:null,
 });
 return {...result,status:'WAITING_FOR_FOOTAGE',
  sourceProposal:path,sourceProposalSha256:sha(text),
  authorChosenIdeaId:chosen.id,publicationApproved:false};
}
const usage=[
 'Usage:',
 '  npm run persona:ideas -- propose "<THEME>" "<NEW_PROPOSAL_DIR>" "<SERVERS.json>" [style]',
 '  npm run persona:ideas -- select "<IDEAS.json>" "<IDEA_ID>" "<NEW_PRODUCTION_DIR>" "<SERVERS.json>" [CATALOG_INDEX.json]',
].join('\n');
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [cmd,...args]=process.argv.slice(2);
 try{
  let result;
  if(cmd==='propose'){
   const [theme,outputDir,config,style]=args;
   const servers=JSON.parse(await readFile(resolve(config),'utf8')).servers;
   result=await proposePersonaIdeas({theme,outputDir,servers,style:style??'cinematic'});
  }else if(cmd==='select'){
   const [proposalPath,ideaId,outputDir,config,libraryIndexPath]=args;
   const servers=JSON.parse(await readFile(resolve(config),'utf8')).servers;
   result=await selectPersonaIdea({proposalPath,ideaId,outputDir,servers,libraryIndexPath});
  }else fail(usage);
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(e){process.stderr.write(String(e?.message??e)+'\n'+usage+'\n');process.exitCode=1}
}
