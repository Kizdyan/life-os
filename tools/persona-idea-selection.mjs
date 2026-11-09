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
import {modelJSON,preparePersonaFlow,validateIdeas} from './persona-flow.mjs';
import {commercialPrompt,commercialExamplesSha256,readCommercialIdeaDetails} from './persona-commercial-prompt.mjs';

const fail=m=>{throw Error('Persona ideas: '+m)};
const txt=(x,min,max)=>typeof x==='string'&&x.trim().length>=min&&x.length<=max;
const styles=new Set(['cinematic','humor','intimate','unexpected']);
const sys='Ты предлагаешь актёру и композитору три разных оригинальных коротких видео. Никаких шаблонных советов, выдуманных личных фактов и повторяющихся хуков. Отвечай ТОЛЬКО JSON формата {"ideas":[{"title":"...","angle":"...","hook":"..."},...]}.';
async function absent(path){
 await access(path).then(()=>fail('Output exists: '+path),e=>{if(e?.code!=='ENOENT')throw e});
}
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function proposePersonaIdeas({
 theme,outputDir,servers,style='cinematic',fetchImpl=fetch,contentFormat=null,ideaCount=3,
}={}){
 if(!txt(theme,8,700)||!styles.has(style)||!txt(outputDir,1,1000))
  fail('Valid theme, style and fresh output directory required');
 const dir=resolve(outputDir);await absent(dir);
 if(![1,3].includes(ideaCount)||!contentFormat&&ideaCount!==3)fail('One-idea mode requires an explicit commercial format');
 const system=contentFormat?commercialPrompt(contentFormat,ideaCount):sys;
 const proposalResponse=await modelJSON({servers,fetchImpl,system,...(contentFormat?{contextTokens:8192,timeoutMs:300000,maxOutputTokens:2200,thinking:false}:{}),
  payload:{theme,style,
   requirements:'one actor; one room; phone + tripod; possible piano; shootable 20–50 sec; character and humor'}});
 const ideas=validateIdeas(proposalResponse.data,contentFormat?{count:ideaCount}:{}).map((idea,index)=>contentFormat?{...idea,...readCommercialIdeaDetails(proposalResponse.data.ideas[index])}:idea);
 const proposal={version:1,kind:'persona-idea-proposal-v1',status:'AWAITING_AUTHOR_IDEA_SELECTION',
  generatedAt:new Date().toISOString(),theme,style,ideas,provider:proposalResponse.provider,
  selectedIdeaId:null,screenplayGenerated:false,publicationApproved:false,
  ...(contentFormat?{contentFormat,ideaCount,examplesSha256:commercialExamplesSha256,systemPromptSha256:sha(system),modelResponse:proposalResponse.data}:{}),};
 const markdown=[
  '# Persona — варианты на выбор автора','',
  '**Результат модели, пока без сценариев. Ни одна идея не выбрана.**','',
  ...ideas.flatMap(idea=>[
   '## '+idea.id+' · '+idea.title,'',
   'Хук: '+idea.hook,'',
   'Замысел: '+idea.angle,'',
  ]),
  'Выбери ID понравившейся идеи и запусти persona:ideas -- select.','',
 ];
 await mkdir(dir,{recursive:false});
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
 const ideas=validateIdeas(proposal,proposal.contentFormat?{count:proposal.ideaCount}:{});
 if(ideas.some((idea,i)=>proposal.ideas[i].id!==idea.id||
  proposal.ideas[i].format!=='reel'))fail('Saved candidate IDs or formats were changed');
 const chosen=ideas.find(i=>i.id===ideaId);
 if(!chosen)fail('No such candidate in saved real model proposal: '+ideaId);
 const output=resolve(outputDir);await absent(output);
 const result=await preparePersonaFlow({
  theme:proposal.theme,style:proposal.style,outputDir:output,servers,
  libraryIndexPath,fetchImpl,ideasFromProposal:ideas,selectedIdeaId:ideaId,
  ideasProvider:proposal.provider,sourceProposalSha256:sha(text),
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
