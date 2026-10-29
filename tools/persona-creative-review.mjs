#!/usr/bin/env node
/**
 * Human creative QA template and report. Does not inspect/alter video or
 * fabricate aesthetic judgements. No publication approval can be granted here.
 */
import {readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const readJson=async p=>JSON.parse(await readFile(resolve(p),'utf8'));
const fail=message=>{throw Error(message)};
export function validateCreativeProfile(profile){
 if(profile?.kind!=='persona-creative-profile-v1'||profile.version!==1||
   !Array.isArray(profile.reviewCategories)||profile.reviewCategories.length<1||
   profile.reviewCategories.length>16||
   new Set(profile.reviewCategories).size!==profile.reviewCategories.length||
   profile.reviewCategories.some(x=>typeof x!=='string'||!/^[a-zA-Z]{3,30}$/.test(x))||
   !Array.isArray(profile.immutableIdentity)||profile.immutableIdentity.length<1)
  fail('Invalid creative profile');
 return true;
}
export function makeCreativeReview(pack,profile){
 validateCreativeProfile(profile);
 if(pack?.kind!=='persona-editorial-candidate-pack-v1'||!Array.isArray(pack.beats)||pack.beats.length<2)
  fail('Invalid editorial candidate pack');
 return {version:1,kind:'persona-creative-review-v1',status:'unreviewed',publicationApproved:false,
  profileKind:profile.kind,profileVersion:profile.version,
  scenes:pack.beats.map((beat,index)=>({
   beat:index+1,scriptLine:beat.scriptLine,selectedCandidateId:beat.defaultCandidateId,
   checks:Object.fromEntries(profile.reviewCategories.map(key=>[key,null])),
   remarks:'',issues:[],
   note:'Null means not checked. Never treat blank checks as passing.'
  })),
  finalNotes:'',
  notice:'Human reviews each scene and the exported MP4. This file never grants publication approval.'};
}
export function summarizeCreativeReview(review,profile){
 validateCreativeProfile(profile);
 if(review?.kind!=='persona-creative-review-v1'||!Array.isArray(review.scenes)||review.scenes.length<2||
    review.profileVersion!==profile.version||
    review.authorApproved!==undefined||review.approved!==undefined||
    review.publicationApproved!==false) fail('Invalid or unsafe creative review');
 const rows=[],memory=[];
 for(let i=0;i<review.scenes.length;i++){
  const scene=review.scenes[i];
  if(scene?.beat!==i+1||!scene.checks||typeof scene.checks!=='object'||Array.isArray(scene.checks))
   fail('Creative review scene order mismatch');
  const checks={};
  for(const key of profile.reviewCategories){
   const val=scene.checks[key];
   if(val!==null&&val!==true&&val!==false)fail('Creative review check must be true/false/null');
   checks[key]=val;
  }
  if(Object.keys(scene.checks).some(k=>!profile.reviewCategories.includes(k)))fail('Unexpected QA check field');
  if(!Array.isArray(scene.issues)||scene.issues.length>20||
    scene.issues.some(x=>typeof x!=='string'||x.trim().length<3||x.length>300)||
    typeof scene.remarks!=='string'||scene.remarks.length>1000)
    fail('Invalid creative review comments');
  const failed=Object.entries(checks).filter(([,val])=>val===false).map(([key])=>key);
  const unreviewed=Object.entries(checks).filter(([,val])=>val===null).map(([key])=>key);
  if(failed.length&&(!scene.issues.length&&!scene.remarks.trim()))
   fail('Explain failed creative checks at beat '+scene.beat);
  rows.push({beat:scene.beat,failed,unreviewed,issues:scene.issues,
    remarks:scene.remarks,status:failed.length||scene.issues.length?'changes-requested':
     unreviewed.length?'needs-human-review':'technically-reviewed-by-human-not-approved'});
  if(scene.remarks.trim()||scene.issues.length){
   memory.push({beat:scene.beat,selectedCandidateId:scene.selectedCandidateId,
    remark:scene.remarks.trim(),issues:scene.issues,
    failedCategories:failed,origin:'explicit-author-feedback'});
  }
 }
 const open=rows.filter(x=>x.status!=='technically-reviewed-by-human-not-approved');
 const status=open.length?'needs-human-review':'ready-for-separate-author-approval';
 return {
  summary:{version:1,kind:'persona-creative-review-summary-v1',status,publicationApproved:false,
   scenes:rows,unresolvedCount:open.length,
   caveat:'Only human-entered checklist data. No AI inspected visual quality and no publication approval was issued.'},
  memory:{version:1,kind:'persona-creative-feedback-v1',source:'explicit-human-comments',
   observations:memory,usedForModelTraining:false}
 };
}
export function formatCreativeReview(report){
 if(report?.kind!=='persona-creative-review-summary-v1')fail('Invalid creative QA summary');
 const lines=['# Persona · художественная приёмка','',
  '**Статус:** '+report.status+'; публикация не утверждена.','',
  '| Сцена | Статус | Требуют исправления | Не проверено |',
  '| --- | --- | --- | --- |'];
 for(const s of report.scenes)
  lines.push('| '+s.beat+' | '+s.status+' | '+(s.failed.join(', ')||'—')+' | '+(s.unreviewed.join(', ')||'—')+' |');
 lines.push('','## Замечания автора','');
 for(const s of report.scenes){
  if(!s.remarks&&!s.issues.length)continue;
  lines.push('**Сцена '+s.beat+':** '+(s.remarks||'Без комментария'));
  for(const issue of s.issues)lines.push('- '+issue);
 }
 lines.push('','Отчёт не заменяет просмотр MP4 и не снимает блокировку публикации.','');
 return lines.join('\n');
}
export async function initReview(packPath,profilePath,outPath){
 const [pack,profile]=await Promise.all([readJson(packPath),readJson(profilePath)]);
 const review=makeCreativeReview(pack,profile);
 await writeFile(resolve(outPath),JSON.stringify(review,null,2)+'\n',{flag:'wx'});
 return {reviewPath:resolve(outPath),status:review.status,scenes:review.scenes.length};
}
export async function finishReview(reviewPath,profilePath,reportPath,memoryPath){
 const [review,profile]=await Promise.all([readJson(reviewPath),readJson(profilePath)]);
 const {summary,memory}=summarizeCreativeReview(review,profile);
 await writeFile(resolve(reportPath),formatCreativeReview(summary),{flag:'wx'});
 try{await writeFile(resolve(memoryPath),JSON.stringify(memory,null,2)+'\n',{flag:'wx'});}
 catch(e){await rm(resolve(reportPath),{force:true});throw e;}
 return {reportPath:resolve(reportPath),memoryPath:resolve(memoryPath),
  status:summary.status,unresolvedCount:summary.unresolvedCount,publicationApproved:false};
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const [action,a,b,c,d]=process.argv.slice(2);
 const operation=action==='init'&&a&&b&&c?initReview(a,b,c):
  action==='finish'&&a&&b&&c&&d?finishReview(a,b,c,d):null;
 if(!operation){console.error('Usage: init <candidate-pack> <creative-profile> <new-review.json> | finish <review.json> <creative-profile> <new-report.md> <new-memory.json>');process.exitCode=2;}
 else operation.then(x=>console.log(JSON.stringify(x,null,2))).catch(e=>{console.error('Persona creative review:',e.message);process.exitCode=1});
}
