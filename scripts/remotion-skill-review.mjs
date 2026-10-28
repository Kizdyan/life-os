#!/usr/bin/env node
/**
 * Remotion Agent Skills pre-admission review packet, pinned to an audited Git tree.
 * No installation, execution, network access, provider activation or publication.
 * A matching repository tree is not a security or license approval.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { verifySkillCheckout } from './skill-source-verify-git.mjs';

export const REMOTION_SKILL_PIN = Object.freeze({
  repository: 'https://github.com/remotion-dev/skills',
  commit: '30d4553ecd46fbc5212fd0ff006ae43af522158b',
  path: 'skills/remotion-best-practices',
  files: 144,
  bytes: 1183282,
  extensions: Object.freeze({md:88,yaml:13,svg:13,tsx:10,json:8,ts:6,geojson:2,mjs:4}),
});

const HEX64 = /^[a-f0-9]{64}$/i;
const CHECKLIST = Object.freeze([
  'Identify a human reviewer and examine all executable and network-capable instructions.',
  'Review Remotion library and Agent Skill licensing for the intended commercial use.',
  'Resolve each review-level finding against the exact pinned bundle digest.',
  'Validate requested permissions and the handling of private media and credentials.',
  'Run at least three isolated, measured sandbox scenarios and compare video quality with FFmpeg baseline.',
  'Verify real AI-provider readiness and require final manual admission approval.',
]);

export function buildRemotionSkillReviewPacket(audit) {
  const reasons = [];
  if (!audit || typeof audit !== 'object') {
    return {status:'blocked',reasons:['Pinned Git audit report missing'],reviewerApproved:false,
      mayInstallAutomatically:false,mayExecuteAutomatically:false,mayPublishAutomatically:false};
  }
  if (audit.schemaVersion !== 1 || !audit.revisionVerified ||
      audit.verificationMethod !== 'pinned-local-git-tree-blob' ||
      audit.sourceRevision !== REMOTION_SKILL_PIN.commit ||
      audit.sourceSkillPath !== REMOTION_SKILL_PIN.path) {
    reasons.push('Pinned Git source verification is missing or mismatched');
  }
  if (!audit.inventoryComplete || audit.scannedFiles !== REMOTION_SKILL_PIN.files ||
      audit.totalBytes !== REMOTION_SKILL_PIN.bytes ||
      !Array.isArray(audit.files) || audit.files.length !== REMOTION_SKILL_PIN.files) {
    reasons.push('Source size or inventory differs from pinned upstream Git tree');
  }
  if (!HEX64.test(audit.manifestSha256??'') || !HEX64.test(audit.bundleSha256??'')) {
    reasons.push('Measured source SHA-256 digests missing or malformed');
  }
  if (audit.installationPerformed || audit.executionPerformed) {
    reasons.push('Source audit must precede any third-party execution or installation');
  }
  const ext = {};
  if (Array.isArray(audit.files)) for(const file of audit.files) {
    if(typeof file?.path !== 'string' || typeof file?.sha256 !== 'string' ||
       !HEX64.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) {
      reasons.push('Malformed source file inventory');
      break;
    }
    const suffix=file.path.split('.').pop().toLowerCase();
    ext[suffix]=(ext[suffix]??0)+1;
  }
  if(Object.entries(REMOTION_SKILL_PIN.extensions).some(([extension,count])=>ext[extension]!==count)) {
    reasons.push('Source file-type composition differs from pinned upstream tree');
  }
  const findings=Array.isArray(audit.findings)?audit.findings:null;
  if(!findings){reasons.push('Source findings list missing');}
  const manualFindings=[],blockedFindings=[];
  if(findings)for(const finding of findings){
    if(typeof finding?.path!=='string' || !finding.path || typeof finding?.rule!=='string' ||
       !finding.rule || !['block','review'].includes(finding.severity)) {
      reasons.push('Invalid source finding entry');
      continue;
    }
    const entry={path:finding.path,rule:finding.rule,severity:finding.severity};
    if(finding.severity==='block')blockedFindings.push(entry);
    else manualFindings.push(entry);
  }
  if(blockedFindings.length)reasons.push('Blocking source inspection findings must be resolved');
  if(audit.staticCheckPassed===false && !findings?.length)
    reasons.push('Static source audit failed without actionable findings');

  return {
    schemaVersion:1,
    status:reasons.length?'blocked':'manual_review_required',
    source:{repository:REMOTION_SKILL_PIN.repository,commit:REMOTION_SKILL_PIN.commit,
      path:REMOTION_SKILL_PIN.path,manifestSha256:audit.manifestSha256??null,
      bundleSha256:audit.bundleSha256??null},
    inventory:{files:audit.scannedFiles??null,bytes:audit.totalBytes??null,
      executableCodeFiles:(ext.mjs??0)+(ext.ts??0)+(ext.tsx??0),
      manuallyFlagged:manualFindings.length,blocked:blockedFindings.length},
    reasons,manualFindings,blockedFindings,checklist:[...CHECKLIST],
    upstreamPublisherAuthenticated:false,
    reviewerApproved:false,
    mayInstallAutomatically:false,mayExecuteAutomatically:false,mayPublishAutomatically:false,
  };
}

export async function verifyRemotionSkillForReview(checkout) {
  const audit=await verifySkillCheckout(checkout,REMOTION_SKILL_PIN.path,REMOTION_SKILL_PIN.commit);
  return buildRemotionSkillReviewPacket(audit);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  if(process.argv.length<3||process.argv.length>4) {
    console.error('Usage: node scripts/remotion-skill-review.mjs <pinned-local-repo> [report.json]');
    process.exitCode=2;
  }else verifyRemotionSkillForReview(process.argv[2]).then(async report=>{
    const json=JSON.stringify(report,null,2)+'\n';
    if(process.argv[3])await writeFile(resolve(process.argv[3]),json,{flag:'wx'});
    else process.stdout.write(json);
    if(report.status==='blocked')process.exitCode=1;
  }).catch(error=>{console.error(error.message);process.exitCode=2;});
}
