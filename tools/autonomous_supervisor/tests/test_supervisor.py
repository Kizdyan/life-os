import json,os,tempfile,threading,time,unittest,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from supervisor import H,HTML,Store,Runner,ExecutionModeConflict,advance_milestones,capability_status,codex_result_available,codex_unavailable,critic_clean,critic_command,default_codex_command,execution_mode,execution_mode_snapshot,integration_preflight,job_executor,load_planner_registry,planned_job_spec,reconcile_registry_outcomes,record_local_ai_success,repair_prompt,replenish_backlog,required_capabilities,resolve_base,quota,seed_store,set_execution_mode
from local_coding_adapter import LocalCodingError,apply_edits,build_prompt,build_repair_context,classify_failure,diff_fingerprint,order_checks,parse_response,prepare_command,validate_changed_paths,validate_required_changes,validate_test_integrity

class T(unittest.TestCase):
 def setUp(self):self.d=tempfile.TemporaryDirectory();self.s=Store(Path(self.d.name)/"s.db")
 def tearDown(self):self.s.c.close();self.d.cleanup()
 def test_durable_queue(self):
  self.s.add("x","shell",{"command":"true"},7,"J1");self.s.c.close();self.s=Store(Path(self.d.name)/"s.db");self.assertEqual(self.s.jobs()[0]["state"],"QUEUED")
 def test_wait_until_quota_reset(self):
  self.s.add("x","shell",{"command":"true"},7,"J1");self.s.state("J1","WAITING_FOR_CODEX",not_before=time.time()+60);self.assertIsNone(self.s.pick())
 def test_quota_detection(self):self.assertTrue(quota("usage limit reached; reset later"))
 def test_codex_zero_exit_with_limit_message_is_not_availability_proof(self):
  self.assertFalse(codex_result_available(0,"429 rate limit reached"))
  self.assertFalse(codex_result_available(1,"normal error"))
  self.assertTrue(codex_result_available(0,"task finished"))
 def test_codex_transport_outage_is_capability_unavailable(self):
  self.assertTrue(codex_unavailable("workspace routing discovery failed; Reconnecting... 5/5"))
 def test_seed_store_is_idempotent_without_http_server(self):
  seed=Path(self.d.name)/"seed.json";seed.write_text('{"jobs":[{"id":"J-SEED","title":"seed","priority":1,"kind":"shell","payload":{"command":"true"}}]}')
  self.assertEqual(seed_store(self.s,str(seed)),1);self.assertEqual(seed_store(self.s,str(seed)),0);self.assertEqual([x["id"] for x in self.s.jobs()],["J-SEED"])
 def test_default_codex_command_uses_supported_noninteractive_flags(self):
  command=default_codex_command()
  self.assertEqual(command[:2],["codex","exec"])
  self.assertIn("--approve-for-me",command)
  self.assertNotIn("--sandbox",command)
  self.assertNotIn("--ask-for-approval",command)
 def test_interrupted_active_state_is_requeued_on_startup(self):
  self.s.add("x","shell",{"command":"true"},7,"J1")
  self.s.state("J1","CODING")
  recovered=self.s.recover_interrupted()
  self.assertEqual(recovered,["J1"])
  self.assertEqual(self.s.jobs()[0]["state"],"QUEUED")
  self.assertIn("recovered after supervisor restart",self.s.jobs()[0]["last_error"])
 def test_command_timeout_terminates_subprocess(self):
  r=Runner({"loop_seconds":1,"command_timeout_seconds":0.05},self.s)
  with self.assertRaises(TimeoutError):r.cmd(["bash","-lc","sleep 2"],Path(self.d.name))
 def test_repair_prompt_is_bounded_and_includes_failure(self):
  text=repair_prompt("base instructions","npm test",7,"bad output")
  self.assertIn("npm test",text);self.assertIn("exit 7",text);self.assertIn("bad output",text)
  self.assertLess(len(text),5000)
 def test_critic_requires_explicit_clean_result(self):
  self.assertTrue(critic_clean("No actionable regressions were found."))
  self.assertTrue(critic_clean("No actionable defects were identified in the current changes."))
  self.assertFalse(critic_clean("[P1] unsafe mutation"))
 def test_critic_reviews_committed_candidate_against_base(self):
  self.assertEqual(critic_command(False,"main"),["codex","exec","review","--base","main"])
  self.assertEqual(critic_command(True,"main"),["codex","exec","review","--uncommitted"])
 def test_service_shutdown_leaves_active_job_recoverable(self):
  class P:
   def poll(self):return None
   def terminate(self):pass
   def wait(self,timeout):return 0
  self.s.add("x","shell",{"command":"true"},7,"J1");r=Runner({"loop_seconds":1},self.s)
  self.s.state("J1","CODING");r.current="J1";r.proc=P()
  self.assertTrue(r.stop_current(cancel=False))
  self.assertEqual(self.s.jobs()[0]["state"],"CODING")
 def test_waiting_codex_job_does_not_block_deterministic_work(self):
  self.s.add("first","codex",{},1,"J1");self.s.state("J1","WAITING_FOR_CODEX",not_before=time.time()+60)
  self.s.add("second","shell",{"command":"true"},2,"J2")
  self.assertEqual(self.s.pick({"CODEX":"WAITING_FOR_QUOTA","SHELL":"AVAILABLE"})["id"],"J2")
  self.assertEqual(self.s.jobs()[0]["state"],"WAITING_FOR_CODEX")
 def test_dashboard_overview_reports_queue_ready_and_last_event(self):
  self.s.add("ready","shell",{},1,"R");self.s.state("R","READY")
  self.s.add("next","shell",{},2,"Q")
  x=self.s.overview()
  self.assertEqual(x["counts"]["READY"],1);self.assertEqual(x["counts"]["QUEUED"],1)
  self.assertEqual(x["last_ready"]["id"],"R");self.assertEqual(x["last_event"]["job_id"],"Q")
 def test_dependency_blocked_job_allows_independent_work(self):
  self.s.add("blocked","codex",{"dependencies":["MISSING"]},1,"B")
  self.s.add("independent","codex",{},2,"I")
  self.assertEqual(self.s.pick()["id"],"I")
 def test_mission_backlog_replenishes_idempotently(self):
  mission={"backlog":[{"id":"P1","title":"one","priority":1,"kind":"codex","payload":{"workstream":"CONTENT_CONVEYOR","prompt":"one"}},{"id":"P2","title":"two","priority":2,"kind":"codex","payload":{"workstream":"VIDEO","dependencies":["P1"],"prompt":"two"}}],"continuation":{"title":"continue","priority":99,"kind":"codex","payload":{"workstream":"CONTENT_CONVEYOR","prompt":"inspect next gap"}}}
  self.assertEqual(replenish_backlog(self.s,mission),2);self.assertEqual(replenish_backlog(self.s,mission),0)
  self.assertEqual(self.s.pick()["id"],"P1")
  self.s.state("P1","READY");self.assertEqual(self.s.pick()["id"],"P2")
  self.s.state("P2","READY");self.assertEqual(replenish_backlog(self.s,mission),1)
  self.assertTrue(self.s.pick()["id"].startswith("ROADMAP-"))
 def test_planner_registry_seeds_known_independent_work_when_codex_queue_is_blocked(self):
  self.s.add("blocked","codex",{"product":"PERSONA"},1,"BLOCKED")
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  mission={"plannerRegistry":[{"id":"LIFE-REQ-1","title":"Fix real boundary","kind":"local_ai","priority":5,"sourceRequirement":"REQ-LIFE-1","targetVersion":"life-next","acceptance":["boundary rejects invalid input"],"payload":{"product":"LIFE_OS","risk":1,"requires":["LOCAL_AI"]}}]}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  seeded=next(j for j in self.s.jobs() if j["id"]=="LIFE-REQ-1")
  self.assertEqual(seeded["payload"]["planner_source_requirement"],"REQ-LIFE-1")
  self.assertEqual(self.s.pick(caps)["id"],"LIFE-REQ-1")
 def test_planner_registry_is_deduplicated_and_refuses_unverifiable_items(self):
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  valid={"id":"DIVE-REQ-1","title":"Useful DiveM guard","kind":"shell","priority":5,"sourceRequirement":"REQ-DIVE-1","targetVersion":"divem-next","acceptance":["real assertion"],"payload":{"product":"DIVE_M","requires":["SHELL"]}}
  invalid={"id":"FAKE-1","title":"activity","kind":"shell","priority":1,"payload":{"product":"LIFE_OS","requires":["SHELL"]}}
  mission={"plannerRegistry":[invalid,valid]}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  self.s.state("DIVE-REQ-1","READY")
  self.assertEqual(replenish_backlog(self.s,mission,caps),0)
  self.assertEqual([j["id"] for j in self.s.jobs()].count("DIVE-REQ-1"),1)
  self.assertNotIn("FAKE-1",[j["id"] for j in self.s.jobs()])
 def test_planner_registry_skips_unready_dependency_and_selects_other_product(self):
  self.s.add("blocked dependency","codex",{},1,"DEP")
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  mission={"plannerRegistry":[
   {"id":"PERSONA-NEXT","title":"blocked","kind":"shell","priority":1,"sourceRequirement":"P1","targetVersion":"persona-next","acceptance":["x"],"payload":{"product":"PERSONA","requires":["SHELL"],"dependencies":["DEP"]}},
   {"id":"LIFE-NEXT","title":"independent","kind":"shell","priority":2,"sourceRequirement":"L1","targetVersion":"life-next","acceptance":["x"],"payload":{"product":"LIFE_OS","requires":["SHELL"]}}]}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  self.assertIn("LIFE-NEXT",[j["id"] for j in self.s.jobs()]);self.assertNotIn("PERSONA-NEXT",[j["id"] for j in self.s.jobs()])
 def test_approved_local_queue_is_materialized_ahead_with_dependencies_preserved(self):
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE","TESTS":"AVAILABLE"}
  def item(jid,priority,product,dependencies=[]):return {"id":jid,"title":jid,"kind":"local_ai","priority":priority,"sourceRequirement":"APPROVED-"+jid,"targetVersion":"next","acceptance":["focused executable evidence"],"payload":{"product":product,"risk":1,"requires":["LOCAL_AI","TESTS"],"dependencies":dependencies,"allowed_files":[jid+".ts"],"test_commands":["true"]}}
  mission={"plannerPolicy":{"approvedLocalQueueDepth":3},"plannerRegistry":[
   item("PERSONA-SLICE",1,"PERSONA"),item("LIFE-SLICE",2,"LIFE_OS",["PERSONA-SLICE"]),item("DIVE-SLICE",3,"DIVE_M",["LIFE-SLICE"])]}
  self.assertEqual(replenish_backlog(self.s,mission,caps),3)
  self.assertEqual([j["id"] for j in self.s.jobs()],["PERSONA-SLICE","LIFE-SLICE","DIVE-SLICE"])
  self.assertEqual(self.s.pick(caps)["id"],"PERSONA-SLICE")
  self.s.state("PERSONA-SLICE","LOCAL_VERIFIED")
  self.assertEqual(self.s.pick(caps)["id"],"LIFE-SLICE")
  self.assertEqual(replenish_backlog(self.s,mission,caps),0)
 def test_failed_dependency_does_not_starve_next_approved_local_slice(self):
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE","TESTS":"AVAILABLE"}
  self.s.add("failed","local_ai",{},1,"FAILED-BASE");self.s.state("FAILED-BASE","FAILED")
  self.s.add("blocked","local_ai",{"dependencies":["FAILED-BASE"]},2,"BLOCKED-SLICE")
  mission={"plannerPolicy":{"approvedLocalQueueDepth":2},"plannerRegistry":[{"id":"NEXT-SLICE","title":"next","kind":"local_ai","priority":3,"status":"ACTIVE","sourceRequirement":"APPROVED","targetVersion":"next","acceptance":["evidence"],"payload":{"product":"LIFE_OS","requires":["LOCAL_AI"]}}]}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  self.assertIn("NEXT-SLICE",[j["id"] for j in self.s.jobs()])
 def test_registry_reconciliation_records_integrated_sha_and_explicit_supersession(self):
  self.s.add("old","local_ai",{},1,"OLD");self.s.state("OLD","FAILED")
  self.s.add("replacement","local_ai",{},2,"NEW");self.s.state("NEW","LOCAL_VERIFIED")
  mission={"plannerRegistry":[
   {"id":"OLD","sourceRequirement":"REQ","targetVersion":"v1","supersededBy":"NEW"},
   {"id":"NEW","sourceRequirement":"REQ","targetVersion":"v1","replaces":["OLD"],"integratedSha":"abc123"}]}
  changed=reconcile_registry_outcomes(self.s,mission,"head",lambda candidate,head:candidate=="abc123" and head=="head")
  self.assertEqual(changed,["NEW","OLD"])
  jobs={j["id"]:j for j in self.s.jobs()}
  self.assertEqual(jobs["NEW"]["state"],"INTEGRATED")
  self.assertEqual(jobs["NEW"]["payload"]["integrated_sha"],"abc123")
  self.assertEqual(jobs["OLD"]["state"],"SUPERSEDED")
  self.assertEqual(jobs["OLD"]["payload"]["superseded_by"],"NEW")
 def test_registry_reconciliation_refuses_unproven_or_non_equivalent_supersession(self):
  self.s.add("old","local_ai",{},1,"OLD");self.s.state("OLD","FAILED")
  self.s.add("replacement","local_ai",{},2,"NEW");self.s.state("NEW","LOCAL_VERIFIED")
  mission={"plannerRegistry":[
   {"id":"OLD","sourceRequirement":"REQ-A","targetVersion":"v1","supersededBy":"NEW"},
   {"id":"NEW","sourceRequirement":"REQ-B","targetVersion":"v1","replaces":["OLD"],"integratedSha":"abc123"}]}
  reconcile_registry_outcomes(self.s,mission,"head",lambda candidate,head:False)
  jobs={j["id"]:j for j in self.s.jobs()}
  self.assertEqual(jobs["NEW"]["state"],"LOCAL_VERIFIED")
  self.assertEqual(jobs["OLD"]["state"],"FAILED")
 def test_superseded_dependency_is_satisfied_but_local_verified_is_reported_distinctly(self):
  self.s.add("old","local_ai",{},1,"OLD");self.s.state("OLD","SUPERSEDED")
  self.s.add("next","local_ai",{"dependencies":["OLD"]},2,"NEXT")
  caps={"LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  self.assertEqual(self.s.pick(caps)["id"],"NEXT")
  summary=self.s.queue_summary(caps)
  self.assertEqual(summary["integrated"],0)
  self.assertEqual(summary["locally_verified"],0)
 def test_external_planner_registry_keeps_mission_as_canonical_base(self):
  root=Path(self.d.name);(root/"planner-registry.v1.json").write_text(json.dumps({"version":1,"milestones":[{"id":"M2"}],"items":[{"id":"X"}]}))
  loaded=load_planner_registry(root,{"mission":"canonical","backlog":[1]})
  self.assertEqual(loaded["mission"],"canonical");self.assertEqual(loaded["backlog"],[1]);self.assertEqual(loaded["plannerRegistry"],[{"id":"X"}])
  self.assertEqual(loaded["plannerMilestones"],[{"id":"M2"}])
  self.assertEqual(loaded["plannerPolicy"],{})
 def test_milestone_orchestrator_activates_approved_successor_once_after_evidence(self):
  self.s.add("verified","local_ai",{"executor_used":"LOCAL_AI"},1,"M1-EVIDENCE");self.s.state("M1-EVIDENCE","LOCAL_VERIFIED")
  mission={"plannerMilestones":[
   {"id":"M1","status":"ACCEPTED","evidenceJobs":["M1-EVIDENCE"]},
   {"id":"M2","status":"APPROVED","dependsOn":["M1"]}]}
  self.assertEqual(advance_milestones(self.s,mission),["M2"])
  self.assertEqual(advance_milestones(self.s,mission),[])
  self.assertIsNotNone(self.s.meta("milestone.active.M2"))
  count=self.s.c.execute("select count(*) from events where type='MILESTONE_ACTIVATED' and msg='M2'").fetchone()[0]
  self.assertEqual(count,1)
 def test_milestone_orchestrator_refuses_successor_without_accepted_evidence(self):
  self.s.add("failed","local_ai",{},1,"M1-EVIDENCE");self.s.state("M1-EVIDENCE","FAILED")
  mission={"plannerMilestones":[
   {"id":"M1","status":"ACCEPTED","evidenceJobs":["M1-EVIDENCE"]},
   {"id":"M2","status":"APPROVED","dependsOn":["M1"]}]}
  self.assertEqual(advance_milestones(self.s,mission),[])
  self.assertIsNone(self.s.meta("milestone.active.M2"))
 def test_milestone_orchestrator_accepts_completed_active_stage_and_advances(self):
  self.s.add("m1","shell",{},1,"M1-E");self.s.state("M1-E","READY")
  mission={"plannerMilestones":[
   {"id":"M1","status":"ACCEPTED","evidenceJobs":["M1-E"]},
   {"id":"M2","status":"APPROVED","dependsOn":["M1"],"evidenceJobs":["M2-E"]},
   {"id":"M3","status":"APPROVED","dependsOn":["M2"]}]}
  self.assertEqual(advance_milestones(self.s,mission),["M2"])
  self.s.add("m2","shell",{},1,"M2-E");self.s.state("M2-E","READY")
  self.assertEqual(advance_milestones(self.s,mission),["M3"])
  self.assertIsNotNone(self.s.meta("milestone.accepted.M2"))
 def test_replenishment_seeds_planned_item_only_after_its_milestone_is_activated(self):
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  item={"id":"M2-LIFE-1","milestone":"M2","status":"PLANNED","title":"approved work","kind":"shell","priority":1,"sourceRequirement":"M2-REQ","targetVersion":"life-next","acceptance":["proof"],"payload":{"product":"LIFE_OS","requires":["SHELL"]}}
  mission={"plannerRegistry":[item]}
  self.assertEqual(replenish_backlog(self.s,mission,caps),0)
  self.s.setmeta("milestone.active.M2",json.dumps({"activatedAt":"now"}))
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
 def test_approved_portfolio_program_advances_from_m2a_to_m2b(self):
  root=Path(__file__).resolve().parents[1]
  mission=load_planner_registry(root,json.loads((root/"mission.v1.json").read_text()))
  self.s.setmeta("milestone.accepted.M1",json.dumps({"acceptedAt":"now"}))
  self.s.setmeta("milestone.accepted.M1.5",json.dumps({"acceptedAt":"now"}))
  self.s.setmeta("milestone.accepted.M2A",json.dumps({"acceptedAt":"now"}))
  self.assertIn("M2B",advance_milestones(self.s,mission))
  self.assertIsNotNone(self.s.meta("milestone.active.M2B"))
 def test_activated_codex_milestone_seeds_an_executable_prompt(self):
  root=Path(__file__).resolve().parents[1]
  mission=load_planner_registry(root,json.loads((root/"mission.v1.json").read_text()))
  mission={**mission,"backlog":[],"fallbackBacklog":[],"continuation":None}
  mission["plannerRegistry"]=[{**item,"status":"PLANNED"} if item.get("id")=="M2-PERSONA-SEMANTIC-GATES-001" else item for item in mission["plannerRegistry"]]
  self.s.setmeta("milestone.active.M2B",json.dumps({"activatedAt":"now"}))
  caps={"CODEX":"AVAILABLE","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE","TESTS":"AVAILABLE"}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  job=next(job for job in self.s.jobs() if job["id"]=="M2-PERSONA-SEMANTIC-GATES-001")
  self.assertTrue(job["payload"].get("prompt"))
 def test_replenishment_uses_local_ai_when_only_codex_work_is_blocked(self):
  self.s.add("blocked","codex",{},1,"C");self.s.state("C","WAITING_FOR_CODEX",not_before=time.time()+300)
  mission={"backlog":[],"continuation":{"title":"roadmap","kind":"local_ai","priority":9,"payload":{"risk":1,"prompt":"select one bounded gap"}}}
  caps={"CODEX":"WAITING_FOR_QUOTA","LOCAL_AI":"AVAILABLE"}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  self.assertEqual(self.s.pick(caps)["kind"],"local_ai")
 def test_approved_codex_requirement_uses_explicit_local_fallback_during_quota(self):
  item={"id":"PERSONA-GAP","title":"full requirement","kind":"codex","priority":1,"status":"ACTIVE","sourceRequirement":"PERSONA-REQ","targetVersion":"persona-next","acceptance":["full acceptance"],"payload":{"product":"PERSONA","risk":2,"requires":["CODEX"],"localFallback":{"approved":True,"title":"bounded local slice","risk":1,"goal":"fix one proven boundary","allowed_files":["a.ts"],"required_changed_files":["a.ts"],"test_commands":["true"],"acceptance":["bounded evidence"]}}}
  caps={"CODEX":"WAITING_FOR_QUOTA","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE","TESTS":"AVAILABLE"}
  kind,payload,title=planned_job_spec(item,caps)
  self.assertEqual((kind,title),("local_ai","bounded local slice"))
  self.assertEqual(payload["planner_source_requirement"],"PERSONA-REQ")
  self.assertEqual(payload["fallback_for_executor"],"CODEX")
  self.assertEqual(payload["risk"],1)
  self.assertTrue(payload["auto_integrate"])
  self.assertEqual(replenish_backlog(self.s,{"plannerRegistry":[item]},caps),1)
  self.assertEqual(self.s.pick(caps)["id"],"PERSONA-GAP")
 def test_unapproved_or_high_risk_fallback_never_downgrades_codex_work(self):
  caps={"CODEX":"WAITING_FOR_QUOTA","LOCAL_AI":"AVAILABLE"}
  base={"id":"X","title":"x","kind":"codex","sourceRequirement":"R","targetVersion":"v","acceptance":["x"],"payload":{"risk":3,"localFallback":{"approved":False,"risk":1}}}
  self.assertEqual(planned_job_spec(base,caps)[0],"codex")
  base["payload"]["localFallback"]={"approved":True,"risk":2}
  self.assertEqual(planned_job_spec(base,caps)[0],"codex")
 def test_auto_integration_is_opt_in_low_risk_scoped_and_conflict_free(self):
  job={"state":"LOCAL_VERIFIED","payload":{"auto_integrate":True,"risk":1,"allowed_files":["a.ts"]}}
  self.assertIsNone(integration_preflight(job,"feature/runtime",["main"],["local.json"],["a.ts"]))
  self.assertEqual(integration_preflight(job,"main",["main"],[],["a.ts"]),"PROTECTED_BRANCH")
  self.assertEqual(integration_preflight(job,"feature/runtime",["main"],["a.ts"],["a.ts"]),"DIRTY_PATH_CONFLICT")
  self.assertEqual(integration_preflight(job,"feature/runtime",["main"],[],["other.ts"]),"PATH_SCOPE_DENIED")
  job["payload"]["risk"]=2
  self.assertEqual(integration_preflight(job,"feature/runtime",["main"],[],["a.ts"]),"RISK_DENIED")
 def test_failed_latest_roadmap_does_not_busy_loop(self):
  mission={"backlog":[],"continuation":{"title":"roadmap","kind":"local_ai","priority":9,"payload":{"risk":1,"prompt":"select one bounded gap"}}};caps={"CODEX":"WAITING_FOR_QUOTA","LOCAL_AI":"AVAILABLE"}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1);jid=self.s.pick(caps)["id"];self.s.state(jid,"FAILED","bounded failure")
  self.assertEqual(replenish_backlog(self.s,mission,caps),0)
 def test_dependent_job_uses_verified_parent_candidate(self):
  self.s.add("parent","codex",{},1,"P");p=self.s.jobs()[0]["payload"];p["candidate_sha"]="abc123";self.s.payload("P",p);self.s.state("P","READY")
  self.assertEqual(resolve_base(self.s,{"dependencies":["P"]},"feature/base"),"abc123")
  self.assertEqual(resolve_base(self.s,{},"feature/base"),"feature/base")
 def test_ready_state_is_not_recovered(self):
  self.s.add("x","shell",{"command":"true"},7,"J1")
  self.s.state("J1","READY")
  self.assertEqual(self.s.recover_interrupted(),[])
  self.assertEqual(self.s.jobs()[0]["state"],"READY")
 def test_old_jobs_derive_safe_capabilities(self):
  self.assertEqual(required_capabilities({"kind":"codex","payload":{}}),{"CODEX"})
  self.assertEqual(required_capabilities({"kind":"shell","payload":{}}),{"SHELL"})
 def test_local_ai_allowed_job_is_selected_only_when_available(self):
  self.s.add("local","local_ai",{"risk":1},1,"L")
  self.assertIsNone(self.s.pick({"LOCAL_AI":"NOT_INSTALLED"}))
  self.assertEqual(self.s.pick({"LOCAL_AI":"AVAILABLE"})["id"],"L")
 def test_codex_required_is_never_routed_to_local_ai(self):
  job={"kind":"codex","payload":{"risk":3,"executor":"LOCAL_AI"}}
  self.assertEqual(job_executor(job),"CODEX")
  self.assertEqual(required_capabilities(job),{"CODEX"})
 def test_waiting_codex_becomes_runnable_after_recovery(self):
  self.s.add("codex","codex",{},1,"C");self.s.state("C","WAITING_FOR_CODEX",not_before=time.time()-1)
  self.assertIsNone(self.s.pick({"CODEX":"WAITING_FOR_QUOTA"}))
  self.assertEqual(self.s.pick({"CODEX":"AVAILABLE"})["id"],"C")
 def test_capability_state_survives_restart(self):
  self.s.setmeta("capability.CODEX",'{"status":"WAITING_FOR_QUOTA","retry_at":123}')
  self.s.c.close();self.s=Store(Path(self.d.name)/"s.db")
  self.assertEqual(capability_status(self.s,"CODEX")["status"],"WAITING_FOR_QUOTA")
 def test_local_ready_pending_review_survives_restart(self):
  self.s.add("local","local_ai",{"risk":1},1,"L");self.s.state("L","LOCAL_READY_PENDING_CODEX_REVIEW")
  self.s.c.close();self.s=Store(Path(self.d.name)/"s.db")
  self.assertEqual(self.s.jobs()[0]["state"],"LOCAL_READY_PENDING_CODEX_REVIEW")
 def test_queue_summary_distinguishes_runnable_and_waiting(self):
  self.s.add("codex","codex",{"product":"PERSONA"},1,"C");self.s.state("C","WAITING_FOR_CODEX",not_before=time.time()+60)
  self.s.add("shell","shell",{"product":"SHARED","command":"true"},2,"S")
  self.s.add("human","shell",{"product":"LIFE_OS"},3,"H");self.s.state("H","HUMAN_REQUIRED")
  summary=self.s.queue_summary({"CODEX":"WAITING_FOR_QUOTA","SHELL":"AVAILABLE"})
  self.assertEqual(summary["runnable"],1);self.assertEqual(summary["waiting_codex"],1);self.assertEqual(summary["waiting_human"],1)
 def test_dashboard_polling_is_resilient_and_times_are_local_only(self):
  self.assertIn("const POLL_MS=4000",HTML)
  self.assertIn("cache:'no-store'",HTML)
  self.assertIn("if(refreshing)return",HTML)
  self.assertIn("visibilitychange",HTML);self.assertIn("addEventListener('focus'",HTML)
  self.assertIn("Intl.DateTimeFormat().resolvedOptions().timeZone",HTML)
  self.assertIn("Updated: ",HTML);self.assertIn("Time zone: ",HTML)
  self.assertNotIn("location.reload",HTML);self.assertNotIn("setInterval",HTML)
 def test_portfolio_fairness_prevents_ready_product_starvation(self):
  self.s.add("persona one","codex",{"product":"PERSONA"},1,"P1")
  self.s.add("life os","shell",{"product":"LIFE_OS","command":"true"},100,"L1")
  self.s.setmeta("scheduler.last_product","PERSONA");self.s.setmeta("scheduler.consecutive_product_jobs","3")
  policy={"maxConsecutiveJobsPerProduct":3}
  picked=self.s.pick({"CODEX":"AVAILABLE","SHELL":"AVAILABLE"},policy)
  self.assertEqual(picked["id"],"L1")
 def test_canonical_mission_plans_across_the_whole_portfolio(self):
  mission=json.loads((Path(__file__).resolve().parents[1]/"mission.v1.json").read_text())
  self.assertEqual(set(mission["canonicalProducts"]),{"PERSONA","LIFE_OS","DIVE_M","SHARED"})
  self.assertEqual(set(mission["continuation"]["payload"]["planning_products"]),set(mission["canonicalProducts"]))
  self.assertIn("highest-value bounded next step",mission["continuation"]["payload"]["prompt"])
 def test_master_mission_seeds_real_local_product_work_when_codex_is_disabled(self):
  root=Path(__file__).resolve().parents[1]
  mission=load_planner_registry(root,{},root/"planner-registry.v1.json")
  required={"P1-LIFE-LOCAL-MOVE-001","P1-LIFE-ERIKA-MOVE-UI-001","P1-DIVEM-DIAGNOSTIC-001"}
  items={item["id"]:item for item in mission["plannerRegistry"]}
  self.assertTrue(required.issubset(items))
  for jid in required:
   item=items[jid];payload=item["payload"]
   self.assertEqual(item["kind"],"local_ai")
   self.assertEqual(payload["risk"],1)
   self.assertTrue(payload["allowed_files"])
   self.assertTrue(payload["required_changed_files"])
   self.assertTrue(item["acceptance"])
   self.assertTrue(item["sourceRequirement"])
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE","TESTS":"AVAILABLE","TYPECHECK":"AVAILABLE"}
  self.assertEqual(replenish_backlog(self.s,mission,caps),3)
  seeded={job["id"] for job in self.s.jobs(100)}
  self.assertTrue(required.issubset(seeded))
 def test_quality_first_addendum_is_durable_and_evidence_bound(self):
  mission=json.loads((Path(__file__).resolve().parents[1]/"mission.v1.json").read_text())
  policy=mission["qualityFirstAddendum"]
  self.assertEqual(set(policy["continuousConveyors"]),{"DEVELOPMENT","USER_WORK"})
  self.assertEqual(len(policy["invariants"]),20)
  self.assertEqual(policy["readyPolicy"]["missingEvidence"],"UNKNOWN")
  self.assertEqual(policy["releasePolicy"]["states"],["DEVELOPMENT_READY","INTEGRATION_READY","RELEASE_READY","PRODUCTION_RELEASED"])
  self.assertIn("LOCAL_READY_PENDING_CODEX_REVIEW",policy["capabilityPolicy"]["localAiSemanticReviewState"])
  self.assertTrue(policy["liveDataPolicy"]["isolatedFromDevelopmentAndTests"])
 def test_local_only_blocks_codex_but_keeps_local_and_shell_runnable(self):
  set_execution_mode(self.s,"LOCAL_ONLY")
  self.s.add("codex","codex",{},1,"C");self.s.add("local","local_ai",{"risk":1},2,"L");self.s.add("shell","shell",{"command":"true"},3,"S")
  caps={"CODEX":"DISABLED_BY_USER","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  self.assertEqual(execution_mode(self.s),"LOCAL_ONLY")
  self.assertEqual(self.s.pick(caps)["id"],"L")
  self.s.state("L","READY");self.assertEqual(self.s.pick(caps)["id"],"S")
 def test_execution_mode_survives_store_restart_and_releases_waits(self):
  set_execution_mode(self.s,"LOCAL_ONLY");self.s.add("codex","codex",{},1,"C");self.s.state("C","WAITING_FOR_CODEX",not_before=time.time()+999)
  self.s.c.close();self.s=Store(Path(self.d.name)/"s.db")
  self.assertEqual(execution_mode(self.s),"LOCAL_ONLY")
  set_execution_mode(self.s,"CODEX_ONLY")
  self.assertEqual(self.s.jobs()[0]["state"],"WAITING_FOR_CODEX");self.assertIsNone(self.s.jobs()[0]["not_before"])
 def test_auto_hybrid_quota_cooldown_survives_restart_and_local_queue_runs(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.add("codex","codex",{},1,"C");self.s.add("local","local_ai",{"risk":1},2,"L")
  r=Runner({"loop_seconds":1,"codex_retry_seconds":300,"local_ai_command":["python3","-V"],"local_ai_model":"qwen2.5-coder:7b"},self.s)
  r.park_codex(self.s.jobs()[0],"429 usage limit reached")
  retry=capability_status(self.s,"CODEX")["retry_at"]
  self.s.c.close();self.s=Store(Path(self.d.name)/"s.db")
  r=Runner(r.cfg,self.s);caps=r.capabilities()
  self.assertEqual(execution_mode(self.s),"AUTO_HYBRID")
  self.assertEqual(caps["CODEX"],"WAITING_FOR_QUOTA")
  self.assertEqual(self.s.pick(caps)["id"],"L")
  self.assertEqual(capability_status(self.s,"CODEX")["retry_at"],retry)
 def test_execution_mode_missing_or_corrupt_fails_closed_and_never_enables_codex(self):
  self.assertEqual(execution_mode(self.s),"LOCAL_ONLY")
  self.assertEqual(execution_mode_snapshot(self.s)["revision"],0)
  self.s.setmeta("execution_mode_state","not-json")
  self.assertEqual(execution_mode(self.s),"LOCAL_ONLY")
  self.assertFalse(execution_mode_snapshot(self.s)["valid"])
  with self.assertRaisesRegex(RuntimeError,"LOCAL_ONLY"):Runner({"loop_seconds":1},self.s).require_codex()
 def test_legacy_codex_allowed_migrates_once_to_codex_only(self):
  self.s.setmeta("execution_mode","CODEX_ALLOWED")
  snapshot=execution_mode_snapshot(self.s)
  self.assertEqual(snapshot["mode"],"CODEX_ONLY")
  self.assertEqual(snapshot["revision"],1)
  self.s.c.close();self.s=Store(Path(self.d.name)/"s.db")
  self.assertEqual(execution_mode_snapshot(self.s),snapshot)
 def test_mode_change_uses_revision_and_rejects_stale_concurrent_request(self):
  initial=execution_mode_snapshot(self.s)
  changed=set_execution_mode(self.s,"AUTO_HYBRID",expected_revision=initial["revision"],actor="owner_control")
  self.assertEqual(changed["revision"],initial["revision"]+1)
  with self.assertRaises(ExecutionModeConflict):
   set_execution_mode(self.s,"CODEX_ONLY",expected_revision=initial["revision"],actor="owner_control")
  self.assertEqual(execution_mode(self.s),"AUTO_HYBRID")
 def test_codex_only_blocks_local_ai_at_launch_boundary(self):
  set_execution_mode(self.s,"CODEX_ONLY")
  runner=Runner({"loop_seconds":1,"local_ai_command":["ollama","run","qwen2.5-coder:7b"],"local_ai_model":"qwen2.5-coder:7b"},self.s)
  with self.assertRaisesRegex(RuntimeError,"CODEX_ONLY"):runner.require_local_ai()
 def test_pending_mode_change_also_rejects_stale_revision(self):
  class P:
   def poll(self):return None
  self.s.add("codex","codex",{},1,"C")
  runner=Runner({"loop_seconds":1},self.s);runner.current="C";runner.proc=P()
  revision=execution_mode_snapshot(self.s)["revision"]
  set_execution_mode(self.s,"AUTO_HYBRID",expected_revision=revision)
  with self.assertRaises(ExecutionModeConflict):
   runner.request_execution_mode("LOCAL_ONLY","after_current",revision)
  self.assertIsNone(self.s.meta("pending_execution_mode"))
 def test_local_only_never_reads_codex_budget(self):
  calls=[];set_execution_mode(self.s,"LOCAL_ONLY")
  r=Runner({"loop_seconds":1,"codex_budget_enabled":True,"codex_budget_reader":lambda:calls.append(1)},self.s)
  self.assertEqual(r.capabilities()["CODEX"],"DISABLED_BY_USER")
  self.assertEqual(r.capabilities()["CODEX"],"DISABLED_BY_USER")
  self.assertEqual(calls,[])
  self.assertEqual(json.loads(self.s.meta("codex.budget"))["state"],"DISABLED_BY_USER")
 def test_auto_hybrid_reads_budget_once_and_blocks_when_weekly_reserve_is_reached(self):
  calls=[];set_execution_mode(self.s,"AUTO_HYBRID")
  def reader():
   calls.append(1);return {"ordinaryUsageAllowed":True,"rateLimits":{"primary":None,"secondary":None},"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":10,"windowDurationMins":300},"secondary":{"usedPercent":90,"windowDurationMins":10080}}}}
  cfg={"loop_seconds":1,"codex_budget_enabled":True,"codex_budget_reader":reader,"codex_budget_refresh_seconds":300,"codex_budget_policy":{"shortReservePercent":10,"weeklyReservePercent":20,"staleAfterSeconds":600}}
  r=Runner(cfg,self.s)
  self.assertEqual(r.capabilities()["CODEX"],"BUDGET_DRAIN")
  self.assertEqual(r.capabilities()["CODEX"],"BUDGET_DRAIN")
  self.assertEqual(len(calls),1)
  self.assertEqual(json.loads(self.s.meta("codex.budget"))["state"],"DRAIN")
 def test_scheduler_skips_codex_task_that_would_consume_weekly_reserve_and_runs_local(self):
  self.s.add("expensive","codex",{"budgetEstimate":{"shortPercent":5,"weeklyPercent":5}},1,"C")
  self.s.add("local","local_ai",{"risk":1},2,"L")
  budget={"state":"NORMAL","snapshot":{"source":"codex_app_server","observedAt":1000,"ordinaryUsageAllowed":True,"short":{"remainingPercent":80},"weekly":{"remainingPercent":22}}}
  scheduler={"_codexBudget":budget,"_codexBudgetPolicy":{"shortReservePercent":10,"weeklyReservePercent":20,"staleAfterSeconds":600},"_clock":1001}
  caps={"CODEX":"AVAILABLE","LOCAL_AI":"AVAILABLE","SHELL":"AVAILABLE"}
  self.assertEqual(self.s.pick(caps,scheduler)["id"],"L")
 def test_auto_hybrid_probe_is_due_once_and_only_success_recovers(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.add("codex","codex",{},1,"C")
  r=Runner({"loop_seconds":1,"codex_retry_seconds":300},self.s)
  r.park_codex(self.s.jobs()[0],"quota exhausted")
  state=capability_status(self.s,"CODEX");state["retry_at"]=time.time()-1;self.s.setmeta("capability.CODEX",json.dumps(state))
  self.s.state("C","WAITING_FOR_CODEX",not_before=time.time()-1)
  caps=r.capabilities()
  self.assertEqual(caps["CODEX"],"PROBE_DUE")
  self.assertEqual(capability_status(self.s,"CODEX")["status"],"WAITING_FOR_QUOTA")
  self.assertEqual(self.s.pick(caps)["id"],"C")
  self.assertEqual(r.capabilities()["CODEX"],"PROBE_DUE")
 def test_auto_hybrid_successful_codex_review_restores_availability(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.add("review","local_ai",{"risk":1,"worktree_path":self.d.name},1,"L")
  self.s.state("L","LOCAL_READY_PENDING_CODEX_REVIEW")
  self.s.setmeta("capability.CODEX",json.dumps({"status":"WAITING_FOR_QUOTA","retry_at":time.time()-1,"reason":"quota"}))
  class R(Runner):
   def cmd(self,*_):return 0,"No actionable findings."
  r=R({"loop_seconds":1},self.s)
  r.codex_review_job(self.s.jobs()[0])
  self.assertEqual(self.s.jobs()[0]["state"],"READY")
  self.assertEqual(capability_status(self.s,"CODEX")["status"],"AVAILABLE")
 def test_auto_hybrid_repeated_quota_uses_bounded_exponential_cooldown(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.add("codex","codex",{},1,"C")
  r=Runner({"loop_seconds":1,"codex_retry_seconds":300},self.s)
  r.park_codex(self.s.jobs()[0],"429 rate limit")
  first=capability_status(self.s,"CODEX")["retry_at"]-time.time()
  r.park_codex(self.s.jobs()[0],"429 rate limit")
  second=capability_status(self.s,"CODEX")["retry_at"]-time.time()
  self.assertGreater(second,first*1.8)
  self.assertEqual(capability_status(self.s,"CODEX")["quota_failures"],2)
 def test_auto_hybrid_network_error_does_not_claim_quota_and_risk_stays_codex(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.add("risky","local_ai",{"risk":2},1,"R")
  self.s.add("safe","local_ai",{"risk":1},2,"L")
  r=Runner({"loop_seconds":1,"codex_retry_seconds":300,"local_ai_command":["python3","-V"],"local_ai_model":"qwen2.5-coder:7b"},self.s)
  r.park_codex(self.s.jobs()[0],"workspace routing discovery failed")
  self.assertEqual(capability_status(self.s,"CODEX")["status"],"ERROR")
  self.assertEqual(self.s.pick(r.capabilities())["id"],"L")
 def test_auto_hybrid_dashboard_and_mode_transition_do_not_interrupt_running_job(self):
  self.assertIn("Авто: Codex ↔ локальная Qwen",HTML)
  self.assertIn("mode('AUTO_HYBRID')",HTML)
  class P:
   def poll(self):return None
  self.s.add("codex","codex",{},1,"C");r=Runner({"loop_seconds":1},self.s);r.current="C";r.proc=P()
  self.assertEqual(r.request_execution_mode("AUTO_HYBRID"),"APPLIED")
  self.assertEqual(execution_mode(self.s),"AUTO_HYBRID")
  self.assertIs(r.proc,r.proc)
 def test_auto_hybrid_transport_failures_keep_retrying_without_quota_label(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.add("codex","codex",{},1,"C")
  r=Runner({"loop_seconds":1,"codex_retry_seconds":300,"max_codex_transport_attempts":3},self.s)
  job=self.s.jobs()[0];job["attempts"]=3
  r.park_codex(job,"workspace routing discovery failed")
  state=capability_status(self.s,"CODEX")
  self.assertEqual(state["status"],"ERROR")
  self.assertFalse(state["manual_hold"])
  self.assertGreater(state["retry_at"],time.time())
 def test_auto_hybrid_control_api_and_status_report_cooldown(self):
  class AppStub:pass
  server=ThreadingHTTPServer(("127.0.0.1",0),H)
  app=AppStub();app.s=self.s;app.r=Runner({"loop_seconds":1},self.s);server.app=app
  thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  base=f"http://127.0.0.1:{server.server_port}"
  try:
   with patch.dict(os.environ,{"SUPERVISOR_CONTROL_TOKEN":"test-token"}):
    req=urllib.request.Request(base+"/api/control",json.dumps({"action":"set_execution_mode","mode":"AUTO_HYBRID"}).encode(),{"content-type":"application/json","x-supervisor-token":"test-token"})
    with urllib.request.urlopen(req) as response:self.assertEqual(response.status,200)
    self.s.setmeta("capability.CODEX",json.dumps({"status":"WAITING_FOR_QUOTA","retry_at":12345,"reason":"quota"}))
    with urllib.request.urlopen(base+"/api/status") as response:status=json.load(response)
    self.assertEqual(status["execution_mode"],"AUTO_HYBRID")
    self.assertEqual(status["codex_cooldown"]["retry_at"],12345)
  finally:server.shutdown();server.server_close();thread.join()
 def test_runner_refuses_codex_process_when_local_only(self):
  set_execution_mode(self.s,"LOCAL_ONLY");r=Runner({"loop_seconds":1},self.s)
  with self.assertRaisesRegex(RuntimeError,"LOCAL_ONLY"):r.require_codex()
  self.assertGreaterEqual(Path(__file__).resolve().parents[1].joinpath("supervisor.py").read_text().count("self.require_codex()"),4)
 def test_dashboard_exposes_real_execution_mode_controls(self):
  self.assertIn("Локально · без Codex",HTML);self.assertIn("Codex разрешён",HTML)
  self.assertIn("set_execution_mode",HTML);self.assertIn("pending_mode",HTML)
 def test_mode_change_can_wait_for_active_codex_without_ui_only_switch(self):
  class P:
   def poll(self):return None
  set_execution_mode(self.s,"CODEX_ONLY")
  self.s.add("codex","codex",{},1,"C");r=Runner({"loop_seconds":1},self.s);r.current="C";r.proc=P()
  self.assertEqual(r.request_execution_mode("LOCAL_ONLY","after_current"),"PENDING_AFTER_CURRENT")
  self.assertEqual(execution_mode(self.s),"CODEX_ONLY");self.assertEqual(self.s.meta("pending_execution_mode"),"LOCAL_ONLY")
 def test_failed_shell_qa_never_becomes_ready(self):
  class R(Runner):
   def cmd(self,*_):return 2,"type error"
  self.s.add("qa","shell",{"command":"false"},1,"Q");job=self.s.jobs()[0]
  R({"loop_seconds":1,"repo_path":self.d.name},self.s).shell_job(job)
  self.assertEqual(self.s.jobs()[0]["state"],"FAILED")
 def test_transport_retry_limit_sets_durable_manual_hold(self):
  self.s.add("codex","codex",{},1,"C");job=self.s.jobs()[0];job["attempts"]=3
  r=Runner({"loop_seconds":1,"codex_retry_seconds":300,"max_codex_transport_attempts":3},self.s)
  r.park_codex(job,"workspace routing discovery failed")
  self.assertTrue(capability_status(self.s,"CODEX")["manual_hold"])
  self.assertIsNone(self.s.jobs()[0]["not_before"])
 def test_local_coding_adapter_reads_and_edits_only_allowlist(self):
  root=Path(self.d.name);(root/"a.ts").write_text("export const a=1;\n")
  task={"goal":"change a","acceptance":["a is 2"],"allowed_files":["a.ts"]}
  self.assertIn("export const a=1",build_prompt(task,root))
  data=parse_response('{"plan":"bounded","edits":[{"path":"a.ts","content":"export const a=2;\\n"}],"risks":[]}')
  self.assertEqual(apply_edits(data,task,root),["a.ts"]);self.assertIn("a=2",(root/"a.ts").read_text())
  with self.assertRaises(LocalCodingError):apply_edits({"edits":[{"path":"x.ts","content":"x"}]},task,root)
 def test_local_coding_parser_ignores_ollama_terminal_control_sequences(self):
  raw='```json\n{\x1b[?25l\x1b[?25h"plan":"bounded","edits":[{"path":"a.ts","content":"export const a=2;\\n"}],"risks":[]}\n```'
  self.assertEqual(parse_response(raw)["plan"],"bounded")
 def test_local_coding_parser_extracts_fenced_json_after_ollama_preamble(self):
  raw='Generating response...\n```json\n{"plan":"bounded","edits":[{"path":"a.ts","content":"export const a=2;\\n"}],"risks":[]}\n```\n'
  self.assertEqual(parse_response(raw)["edits"][0]["path"],"a.ts")
 def test_local_coding_ollama_command_requires_structured_json(self):
  self.assertEqual(prepare_command(["ollama","run","qwen2.5-coder:7b"]),["ollama","run","qwen2.5-coder:7b","--format","json","--hidethinking","--nowordwrap"])
  self.assertEqual(prepare_command(["custom-worker","model"]),["custom-worker","model"])
 def test_local_coding_parser_ignores_ollama_spinner_preamble(self):
  raw='\x1b[1G⠙ \x1b[K\x1b[?25h\n{"plan":"bounded","edits":[{"path":"a.ts","content":"x"}],"risks":[]}\n\x1b[?25h'
  self.assertEqual(parse_response(raw)["plan"],"bounded")
 def test_local_repair_context_contains_failure_kind_exact_output_and_source_lines(self):
  root=Path(self.d.name);p=root/"a.test.ts";p.write_text("one\ntwo\nthree\nfour\n")
  output="a.test.ts(3,7): error TS2345: Property 'items' is missing"
  failure={"command":"npm run typecheck","exit":2,"output":output}
  context=build_repair_context(failure,root,["a.test.ts"])
  self.assertEqual(context["kind"],"TYPECHECK")
  self.assertEqual(context["output"],output)
  self.assertEqual(context["locations"][0]["line"],3)
  self.assertIn("3: three",context["locations"][0]["snippet"])
 def test_local_failure_classification_distinguishes_environment_test_and_typecheck(self):
  self.assertEqual(classify_failure("npm test",127,"vitest: not found"),"ENVIRONMENT")
  self.assertEqual(classify_failure("npm run typecheck",2,"a.ts(1,1): error TS1"),"TYPECHECK")
  self.assertEqual(classify_failure("npm test",1,"Failed Tests 1"),"TEST")
 def test_local_attempt_fingerprint_detects_identical_patch(self):
  self.assertEqual(diff_fingerprint("same"),diff_fingerprint("same"))
  self.assertNotEqual(diff_fingerprint("same"),diff_fingerprint("different"))
 def test_local_low_risk_candidate_cannot_delete_existing_tests_or_assertions(self):
  with self.assertRaises(LocalCodingError):validate_test_integrity('-  it("keeps behavior",()=>{\n-    expect(value).toBe(1);\n')
  validate_test_integrity('+  it("rejects bad input",()=>{ expect(run()).toThrow(); });\n')
 def test_local_candidate_must_change_declared_evidence_files(self):
  validate_required_changes(["a.ts","a.test.ts"],["a.test.ts"])
  with self.assertRaisesRegex(LocalCodingError,"required evidence files"):validate_required_changes(["a.ts"],["a.test.ts"])
 def test_local_repair_prompt_contains_structured_diagnostic(self):
  root=Path(self.d.name);(root/"a.ts").write_text("export const a=1;\n")
  prompt=build_prompt({"goal":"fix","acceptance":[],"allowed_files":["a.ts"],"repair_context":{"kind":"TYPECHECK","output":"a.ts(1,1): error TS1","locations":[]}},root)
  request=json.loads(prompt.split("\n",1)[1]);self.assertEqual(request["repair"]["kind"],"TYPECHECK");self.assertIn("error TS1",request["repair"]["output"])
 def test_local_test_edits_run_typecheck_before_runtime_tests(self):
  commands=["TZ=UTC npm test -- --run a.test.ts","npm run typecheck"]
  self.assertEqual(order_checks(commands,["a.test.ts"]),["npm run typecheck","TZ=UTC npm test -- --run a.test.ts"])
  self.assertEqual(order_checks(commands,["a.ts"]),commands)
 def test_local_verified_satisfies_dependencies_without_becoming_production_ready(self):
  self.s.add("local","local_ai",{"risk":1},1,"L");self.s.state("L","LOCAL_VERIFIED")
  self.s.add("next","shell",{"command":"true","dependencies":["L"]},2,"N")
  self.assertEqual(self.s.pick({"SHELL":"AVAILABLE","LOCAL_AI":"AVAILABLE"})["id"],"N")
 def test_verified_local_candidate_replaces_stale_failed_semantic_proof(self):
  self.s.setmeta("local_ai.semantic_verification","FAILED_REAL_CODE_E2E_QA_REPAIR_LIMIT")
  record_local_ai_success(self.s,"L")
  self.assertEqual(self.s.meta("local_ai.semantic_verification"),"PASSED_REAL_CODE_E2E_LOCAL_VERIFIED:L")
  self.assertIsNotNone(self.s.meta("local_ai.last_success_at"))
 def test_runner_startup_restores_semantic_proof_from_durable_verified_job(self):
  self.s.add("local","local_ai",{"risk":1,"executor_used":"LOCAL_AI"},1,"L");self.s.state("L","LOCAL_VERIFIED")
  self.s.setmeta("local_ai.semantic_verification","FAILED_STALE_VALUE")
  Runner({"loop_seconds":1},self.s)
  self.assertEqual(self.s.meta("local_ai.semantic_verification"),"PASSED_REAL_CODE_E2E_LOCAL_VERIFIED:L")
 def test_budget_caution_keeps_codex_available_for_fitting_tasks(self):
  set_execution_mode(self.s,"AUTO_HYBRID")
  self.s.setmeta("codex.budget",json.dumps({"state":"CAUTION","snapshot":{"source":"codex_app_server","observedAt":time.time(),"ordinaryUsageAllowed":True,"short":{"remainingPercent":30},"weekly":{"remainingPercent":30}},"refreshedAt":time.time()}))
  runner=Runner({"loop_seconds":1,"codex_budget_enabled":True,"codex_budget_refresh_seconds":300,"codex_budget_policy":{"shortReservePercent":10,"weeklyReservePercent":10}},self.s)
  self.assertEqual(runner.capabilities()["CODEX"],"AVAILABLE")
  self.s.add("small","codex",{"budgetEstimate":{"shortPercent":1,"weeklyPercent":1}},1,"C")
  self.assertEqual(self.s.pick(runner.capabilities(),runner.scheduler_policy())["id"],"C")
 def test_budget_refresh_uses_configured_official_app_server_command(self):
  set_execution_mode(self.s,"AUTO_HYBRID");configured=["/trusted/codex.exe","app-server","--listen","stdio://"]
  result={"ordinaryUsageAllowed":True,"rateLimitsByLimitId":{"codex":{"primary":{"usedPercent":20,"windowDurationMins":300},"secondary":{"usedPercent":30,"windowDurationMins":10080}}}}
  with patch("supervisor.read_rate_limits",return_value=result) as reader:
   runner=Runner({"loop_seconds":1,"codex_budget_enabled":True,"codex_budget_refresh_seconds":0,"codex_budget_timeout_seconds":7,"codex_budget_command":configured,"codex_budget_policy":{}},self.s)
   self.assertEqual(runner.refresh_codex_budget()["state"],"NORMAL")
  reader.assert_called_once_with(command=configured,timeout=7.0)
if __name__=="__main__":unittest.main()

