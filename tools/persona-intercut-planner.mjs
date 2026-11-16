/** Persona Jump-Cut planning for already-approved timelines.
 * Never licenses, approves, downloads, or inserts third-party media.
 * The existing persona-approved-broll.mjs performs approved B-roll insertion,
 * subtitle retiming and real FFmpeg rendering. This module decides whether
 * a gap should get a reviewed B-roll recommendation or an optional quiet zoom.
 */
const finite = x => typeof x === 'number' && Number.isFinite(x);
const fail = x => { throw new Error('Persona intercut: ' + x); };
const round = x => Number(x.toFixed(3));
export const INTERCUT_KIND = 'persona-jump-cut-plan-v1';

export function likelyJumpCut(left, right, fps = 30) {
  if (!left || !right || left.jumpCutRisk === false || right.jumpCutRisk === false) return false;
  if (left.jumpCutRisk === true || right.jumpCutRisk === true) return true;
  // This is only a conservative metadata heuristic, never a visual verdict.
  if (typeof left.path !== 'string' || left.path !== right.path) return false;
  if (![left.startSec,left.durationSec,right.startSec].every(finite)) return false;
  const gap = right.startSec - (left.startSec + left.durationSec);
  return Math.abs(gap) > 1/fps + 0.005;
}

export function proposeIntercuts(timeline, {fps=30, eligibleBroll=[], zoomFallback=true} = {}) {
  if (!timeline || timeline.version !== 1 || !Array.isArray(timeline.clips) || !timeline.clips.length) fail('Expected existing version 1 timeline clips');
  if (!Number.isInteger(fps) || fps < 24 || fps > 60) fail('Unsupported fps');
  if (!Array.isArray(eligibleBroll)) fail('eligibleBroll must be array');
  const clips=timeline.clips;
  const suggestions=[];
  for (let i=0;i<clips.length-1;i++) {
    const prev=clips[i], next=clips[i+1];
    if (!likelyJumpCut(prev,next,fps)) continue;
    if (!finite(prev.durationSec) || prev.durationSec<.65) {
      suggestions.push({afterClip:i+1,status:'NEEDS_REVIEW',reason:'Outgoing scene too short for safe zoom'});
      continue;
    }
    const candidates=eligibleBroll.filter(b=>b.afterClip===i+1 && b.isVerified===true && b.rightsConfirmed===true && b.authorReviewed===true && b.approvedForEdit===true && finite(b.durationSec) && b.durationSec>=1 && b.durationSec<=2);
    if (candidates.length) {
      suggestions.push({afterClip:i+1,status:'APPROVED_BROLL_AVAILABLE',mode:'existing-approved-broll-renderer',candidates:candidates.map(x=>({assetId:x.assetId,durationSec:x.durationSec}))});
    } else if (zoomFallback && prev.durationSec>=1.2 && prev.preserveOriginalAudio!==true) {
      suggestions.push({afterClip:i+1,status:'ZOOM_FALLBACK_CANDIDATE',kind:'slow_push_in',durationSec:round(Math.min(.6,prev.durationSec*.3)),maxZoom:1.025,requiresFramingReview:true});
    } else {
      suggestions.push({afterClip:i+1,status:'NEEDS_REVIEW',reason:'No author-reviewed B-roll; do not hide a cut automatically'});
    }
  }
  return {version:1,kind:INTERCUT_KIND,publicationApproved:false,suggestions,notice:'No source media has been edited. Author confirmation required for B-roll and visual zoom.'};
}

export function applyReviewedZoomFallback(timeline, plan, {reviewedAfterClips=[]}={}) {
  if (!plan || plan.kind!==INTERCUT_KIND || !Array.isArray(plan.suggestions)) fail('Invalid intercut plan');
  if (!Array.isArray(reviewedAfterClips) || !reviewedAfterClips.every(Number.isSafeInteger)) fail('Invalid reviewed cut list');
  const reviewed=new Set(reviewedAfterClips);
  const clips=timeline.clips.map(c=>({...c}));
  for (const item of plan.suggestions) {
    if (item.status!=='ZOOM_FALLBACK_CANDIDATE' || !reviewed.has(item.afterClip)) continue;
    const clip=clips[item.afterClip-1];
    if (!clip || clip.preserveOriginalAudio===true || !finite(clip.durationSec) || clip.durationSec<1.2) fail('Zoom cannot be applied to this clip');
    if (clip.intercutFallback!==undefined) fail('Existing fallback requires manual review');
    clip.intercutFallback={kind:'slow_push_in',durationSec:item.durationSec,maxZoom:item.maxZoom,authorReviewed:true};
  }
  return {...timeline,clips,publicationApproved:false};
}
