import fs from'node:fs';import{execFileSync}from'node:child_process';
const statePath=process.env.ADR_STATE||'.autonomous/runtime-state.json',matrix='docs/architecture/master-feature-recovery-2026-10-07.md',now=new Date().toISOString();
const base={version:1,issue:86,branch:'recovery/iphone-static-supabase',phase:2,status:'RUNNING',checkpoint:'PLAN',attempt:0,lastProgressAt:now,humanAcceptance:{phase2:'PENDING'},queue:['Phase 2 — Life OS Core Recovery','Phase 3 — Execution Engine','Phase 4 — Erika Agent','Phase 5 — Calendar/Scheduling intelligence','Phase 6 — Life Analytics Engine','Phase 7 — Persona recovery','Phase 8 — Media Engine','Phase 9 — Content/Distribution automation','Phase 10 — iPhone/offline/reliability hardening','Phase 11 — full real-device E2E']};
let s=base;try{s={...base,...JSON.parse(fs.readFileSync(statePath,'utf8'))}}catch{}
const save=()=>{fs.mkdirSync('.autonomous',{recursive:true});fs.writeFileSync(statePath,JSON.stringify(s,null,2)+'\n')};
const run=(cmd,args)=>{try{execFileSync(cmd,args,{stdio:'inherit'});return true}catch{return false}};
const stale=Date.now()-Date.parse(s.lastProgressAt)>15*60e3;
if(stale){s.status='RECOVERING';s.attempt=(s.attempt||0)+1;s.lastRecoveryAt=now}
if(!fs.existsSync(matrix)){s.status='BLOCKED';s.blocker='MASTER_MATRIX_MISSING';save();process.exit(2)}
s.lastWatchdogAt=now;s.lastProgressAt=now;s.checkpoint='TEST';save();
const ok=run('npm',['test'])&&run('npm',['run','typecheck'])&&run('npm',['run','api:typecheck'])&&run('npm',['run','web:build']);
s.lastAutomatedQA={at:now,ok};s.checkpoint=ok?'PRODUCT_QA':'FIX';s.status=ok?'RUNNING':'QA_FAILED';save();
if(!ok)process.exit(1);
s.checkpoint='CRITIQUE';s.critic={at:now,rule:'No CI-only acceptance; physical iPhone Phase 2 remains non-blocking HUMAN_ACCEPTANCE.'};save();
console.log(JSON.stringify(s,null,2));
