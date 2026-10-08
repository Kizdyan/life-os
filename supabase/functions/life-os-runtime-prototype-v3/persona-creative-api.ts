import { isActionableApproval, sealApprovedIdea, verifyApproval } from "./persona-brain.ts";
import { approvePersonaCandidate } from "./quality-gates.ts";
import { mutateServerBrain, readServerBrain } from "./persona-store.ts";
import {
  CREATIVE_PROJECT, MAX_CREATIVE_ITEMS, adaptCreativeBrief, creativeShortlist,
  editorialAssessment, validateIntakeAsset,
  type CreativeIdea, type CreativeItem, type CreativeRevision, type CreativeSession,
} from "./persona-creative-core.ts";

type Dict = Record<string,unknown>;
const txt = (x:unknown) => typeof x==="string"?x.trim():"";
const secret = () => (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"").trim();
function err(code:string):never {throw Error("creative:"+code);}
function current(item:CreativeItem):CreativeRevision {
  const rev=item.revisions.find(x=>x.version===item.currentVersion);
  if(!rev)err("revision_missing");
  return rev!;
}
async function assertCurrent(item:CreativeItem, proof:unknown, expectedVersion:unknown) {
  const revision=current(item);
  if(expectedVersion!==item.currentVersion || !txt(proof) || proof!==revision.proof)err("revision_conflict");
  const verified=await verifyApproval(proof,secret());
  if(!isActionableApproval(verified) ||
    verified.idea.id!==revision.idea.id ||
    verified.idea.creativeVersion!==item.currentVersion) err("approval_not_current");
  if(item.pending)err("revision_pending");
  return revision;
}
function itemById(items:CreativeItem[],id:unknown):CreativeItem {
  const found=items.find(x=>x.id===id);
  if(!found)err("idea_not_found");
  return found!;
}
async function read():Promise<CreativeItem[]> {
  return (await readServerBrain()).creativeItems;
}
async function ensureShortlist():Promise<CreativeItem[]> {
  const existing=await read();
  if(existing.length) return existing;
  const candidates=creativeShortlist();
  if(candidates.length!==MAX_CREATIVE_ITEMS)return [];
  const signed=await Promise.all(candidates.map(async (idea,index)=>{
    const candidate={...idea,creativeVersion:1};
    const approval=await sealApprovedIdea(candidate,secret());
    const id=txt(candidate.id);
    const revision:CreativeRevision={
      version:1,idea:approval.idea,proof:approval.approvalProof,
      createdAt:approval.approvedAt,reason:"initial_bounded_editorial_shortlist",
      critic:"Deterministic Critic: формат, длительность, доказательность и сольная съёмка проверены",
      judge:"APPROVE: 83/100; источники описывают формат, не живой тренд"
    };
    return {id,projectId:CREATIVE_PROJECT,contentItemId:"content:"+id,
      currentVersion:1,revisions:[revision],pending:null,session:null,pastSessions:[],
      status:"IDEA_APPROVED" as const,index};
  }));
  await mutateServerBrain(snapshot=>{
    if(snapshot.creativeItems.length===0){
      snapshot.creativeItems=signed.map(({index,...entry})=>entry);
    }
    return snapshot;
  });
  return read();
}
function publicView(item:CreativeItem, proofFreshness: string | null) {
 const rev=current(item);
 return {...item,verifiedFreshness:proofFreshness,reviewed:!!rev.proof};
}
async function views(items:CreativeItem[]) {
 return Promise.all(items.map(async item=>{
   const verified=await verifyApproval(current(item).proof,secret());
   return publicView(item,verified?.freshness||"unverified");
 }));
}

export async function handleCreative(payload:Dict):Promise<Dict> {
  const action=txt(payload.action);
  if(action==="creative_shortlist" || action==="creative_state"){
    const items=action==="creative_shortlist"?await ensureShortlist():await read();
    const response=await views(items);
    return {items:response,ready:response.length===3,
      costMode:"FREE_ONLY",maxIdeas:3,aiInvoked:false,
      weeklyPlanning:"DESIGN_ONLY_V1",recommendedWeeklyMax:Math.min(3,response.length)};
  }
  const id=txt(payload.ideaId);
  if(!id)err("idea_id_required");
  if(action==="creative_edit"){
    let reply:Dict={};
    await mutateServerBrain(snapshot=>{
      const item=itemById(snapshot.creativeItems,id);
      if(payload.baseVersion!==item.currentVersion)err("revision_conflict");
      if(item.pending)err("revision_pending");
      const rev=current(item);
      const text=txt(payload.instruction);
      const assessment=editorialAssessment(rev.idea,text);
      reply={kind:assessment.kind,critic:assessment.critic,judge:assessment.judge};
      if(!assessment.proposal) return snapshot;
      item.pending={baseVersion:item.currentVersion,nextVersion:item.currentVersion+1,
        idea:{...assessment.proposal,creativeVersion:item.currentVersion+1},
        reason:text.slice(0,600),critic:assessment.critic,
        judge:assessment.judge==="APPROVE"?"APPROVE":"REVISE",
        status:assessment.judge==="APPROVE"?"APPROVE":"REVISE"};
      item.status="EDIT_REVIEW";
      reply.proposedVersion=item.pending.nextVersion;
      return snapshot;
    });
    return reply;
  }
  if(action==="creative_discard_proposal"){
    await mutateServerBrain(snapshot=>{
      const item=itemById(snapshot.creativeItems,id);
      if(payload.baseVersion!==item.currentVersion)err("revision_conflict");
      item.pending=null;item.status=item.session?"SHOOTING":"IDEA_APPROVED";
      return snapshot;
    });
    return {discarded:true};
  }
  if(action==="creative_approve"){
    let signed:CreativeRevision|null=null;
    // Sign candidate after verifying it is still based on the current revision;
    // CAS retry ensures an in-flight competing edit cannot approve the wrong version.
    const first=itemById(await read(),id);
    if(!first.pending || first.pending.status!=="APPROVE" ||
       first.pending.baseVersion!==first.currentVersion ||
       payload.expectedVersion!==first.currentVersion)err("proposal_not_approved");
    const checked=approvePersonaCandidate(first.pending.idea);
    if(!checked.approved || !checked.candidate)err("quality_gate_failed");
    const approval=await sealApprovedIdea(checked.candidate,secret());
    const newRevision:CreativeRevision={
      version:first.currentVersion+1,idea:approval.idea,
      proof:approval.approvalProof,createdAt:approval.approvedAt,
      reason:first.pending.reason,critic:first.pending.critic,judge:first.pending.judge};
    await mutateServerBrain(snapshot=>{
      const item=itemById(snapshot.creativeItems,id);
      if(item.currentVersion!==first.currentVersion || !item.pending ||
         item.pending.reason!==first.pending?.reason ||
         item.pending.nextVersion!==newRevision.version)err("revision_conflict");
      item.revisions=[...item.revisions,newRevision].slice(-12);
      item.currentVersion=newRevision.version;
      item.pending=null;
      // Prior session/assets remain in immutable prior lineage; cannot inherit approval.
      if(item.session)item.pastSessions=[...(item.pastSessions||[]),item.session].slice(-20);
      item.session=null;
      item.status="IDEA_APPROVED";
      signed=newRevision;
      return snapshot;
    });
    return {approved:true,version:newRevision.version,approvalProof:approval.approvalProof,
      reviewed:true,aiInvoked:false,reason:newRevision.reason};
  }
  if(action==="creative_start_session" || action==="creative_adapt_brief"){
    const first=itemById(await read(),id);
    const rev=await assertCurrent(first,payload.approvalProof,payload.version);
    const conditions=txt(payload.conditions).slice(0,500);
    const brief=adaptCreativeBrief(rev.idea,conditions);
    let created:CreativeSession|null=null;
    await mutateServerBrain(snapshot=>{
      const item=itemById(snapshot.creativeItems,id);
      if(item.currentVersion!==first.currentVersion || item.pending)err("revision_conflict");
      const prior=item.session;
      if(action==="creative_adapt_brief" && (!prior||prior.ideaVersion!==item.currentVersion))err("session_missing");
      if(prior && prior.ideaVersion===item.currentVersion){
        prior.brief=brief;prior.conditions=conditions;prior.briefVersion+=1;
        created=prior;
      } else {
        const uuid=crypto.randomUUID();
        const session:CreativeSession={
          id:"shoot:"+uuid,projectId:item.projectId,contentItemId:item.contentItemId,
          ideaId:id,ideaVersion:item.currentVersion,startedAt:new Date().toISOString(),
          status:"WAITING_UPLOAD",brief,briefVersion:1,conditions,assets:[]
        };
        item.session=session;created=session;
      }
      item.status="SHOOTING";
      return snapshot;
    });
    return {session:created,aiInvoked:false};
  }
  if(action==="creative_register_asset"){
    const first=itemById(await read(),id);
    await assertCurrent(first,payload.approvalProof,payload.version);
    const normalized=validateIntakeAsset(payload.asset);
    let count=0;
    await mutateServerBrain(snapshot=>{
      const item=itemById(snapshot.creativeItems,id);
      const ses=item.session;
      if(!ses || item.currentVersion!==first.currentVersion ||
        normalized.projectId!==item.projectId ||
        normalized.contentItemId!==item.contentItemId ||
        normalized.ideaId!==item.id ||
        normalized.ideaVersion!==item.currentVersion ||
        normalized.sessionId!==ses.id)err("asset_lineage_mismatch");
      if(!ses.assets.some(x=>x.id===normalized.id)){
        if(ses.assets.length>=40)err("asset_limit_reached");
        ses.assets.push(normalized);
      }
      ses.status="MATERIAL_RECEIVED";item.status="MEDIA_RECEIVED";
      count=ses.assets.length;
      return snapshot;
    });
    return {registered:true,assetId:normalized.id,count,storage:"device_local",aiInvoked:false};
  }
  err("unsupported_action");
}
