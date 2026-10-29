#!/usr/bin/env node
/** One-command offline take review kit for a FINISHED local Persona draft. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepare} from './persona-editorial-choices.mjs';
import {generatePreviews} from './persona-editorial-previews.mjs';
import {initReview} from './persona-creative-review.mjs';

const fail=m=>{throw Error(m)};
const here=dirname(fileURLToPath(import.meta.url));
const defaultProfile=resolve(here,'../docs/persona-creative-profile-v1.json');
const readJson=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
export async function prepareReviewKit({draftDir,profilePath=defaultProfile}={}){
 if(typeof draftDir!=='string'||!draftDir.trim())fail('Provide existing local draft directory');
 const root=resolve(draftDir);
 // Never run before a real, verified (but not yet artistically approved) MP4 draft.
 const result=await readJson(join(root,'RESULT.json'));
 if(result.status!=='awaiting-author-review'||result.distributionAllowed!==false||
    typeof result.output!=='string'||typeof result.qaPath!=='string')
  fail('Review kit needs finished technical QA with publication still blocked');
 const qa=await readJson(result.qaPath);
 if(qa?.handoff?.status!=='blocked'||qa?.handoff?.errors?.length!==1||
    qa.handoff.errors[0]!=='author approval required'||
    qa?.evidence?.fileExists!==true||qa.evidence.probeVerified!==true)
  fail('Refusing unverified or already approved draft');
 const decisionsPath=join(root,'decisions.json');
 const decisions=await readJson(decisionsPath);
 if(decisions?.version!==1||typeof decisions.analysisPath!=='string'||typeof decisions.briefPath!=='string')
  fail('Missing local ASR decisions');
 const kit=join(root,'editorial-review-kit');
 await mkdir(kit,{recursive:false});
 const packPath=join(kit,'candidate-pack.json'),selectionPath=join(kit,'selection.json');
 try{
  const prepared=await prepare({analysisPath:decisions.analysisPath,briefPath:decisions.briefPath,
   decisionsPath,packPath,selectionPath});
  const previews=await generatePreviews({packPath,evidencePath:decisions.analysisPath,outputDir:join(kit,'previews')});
  const template=await initReview(packPath,profilePath,join(kit,'creative-review.template.json'));
  const output={version:1,kind:'persona-review-kit-v1',status:'ready-for-human-selection',
   candidatePack:prepared.packPath,selectionTemplate:selectionPath,
   candidateSummary:prepared.summaryPath,playableReviewPage:previews.reviewHtml,
   creativeQaTemplate:template.reviewPath,
   previewCount:previews.previewCount,missingBeats:previews.missingBeats,
   publicationApproved:false,
   instruction:'Open review.html, watch the local videos, export selection.reviewed.json, apply reviewed decisions and then re-render with existing FFmpeg tools.'};
  await writeFile(join(kit,'KIT.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx'});
  return output;
 }catch(err){
  await writeFile(join(kit,'FAILED.json'),JSON.stringify({
   status:'failed',error:String(err.message||err),
   note:'Original footage and the completed draft remain untouched; partial kit kept for inspection.'
  },null,2)+'\n',{flag:'wx'}).catch(()=>{});
  throw err;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [draftDir,profilePath]=process.argv.slice(2);
 prepareReviewKit({draftDir,profilePath}).then(x=>console.log(JSON.stringify(x,null,2)))
 .catch(e=>{console.error('Persona review kit:',e.message);process.exitCode=1});
}
