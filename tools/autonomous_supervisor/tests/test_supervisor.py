import json,tempfile,time,unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from supervisor import HTML,Store,Runner,capability_status,codex_unavailable,critic_clean,critic_command,default_codex_command,execution_mode,job_executor,repair_prompt,replenish_backlog,required_capabilities,resolve_base,quota,seed_store,set_execution_mode
from local_coding_adapter import LocalCodingError,apply_edits,build_prompt,parse_response,prepare_command,validate_changed_paths

class T(unittest.TestCase):
 def setUp(self):self.d=tempfile.TemporaryDirectory();self.s=Store(Path(self.d.name)/"s.db")
 def tearDown(self):self.s.c.close();self.d.cleanup()
 def test_durable_queue(self):
  self.s.add("x","shell",{"command":"true"},7,"J1");self.s.c.close();self.s=Store(Path(self.d.name)/"s.db");self.assertEqual(self.s.jobs()[0]["state"],"QUEUED")
 def test_wait_until_quota_reset(self):
  self.s.add("x","shell",{"command":"true"},7,"J1");self.s.state("J1","WAITING_FOR_CODEX",not_before=time.time()+60);self.assertIsNone(self.s.pick())
 def test_quota_detection(self):self.assertTrue(quota("usage limit reached; reset later"))
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
 def test_replenishment_uses_local_ai_when_only_codex_work_is_blocked(self):
  self.s.add("blocked","codex",{},1,"C");self.s.state("C","WAITING_FOR_CODEX",not_before=time.time()+300)
  mission={"backlog":[],"continuation":{"title":"roadmap","kind":"local_ai","priority":9,"payload":{"risk":1,"prompt":"select one bounded gap"}}}
  caps={"CODEX":"WAITING_FOR_QUOTA","LOCAL_AI":"AVAILABLE"}
  self.assertEqual(replenish_backlog(self.s,mission,caps),1)
  self.assertEqual(self.s.pick(caps)["kind"],"local_ai")
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
  set_execution_mode(self.s,"CODEX_ALLOWED")
  self.assertEqual(self.s.jobs()[0]["state"],"WAITING_FOR_CODEX");self.assertIsNone(self.s.jobs()[0]["not_before"])
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
  self.s.add("codex","codex",{},1,"C");r=Runner({"loop_seconds":1},self.s);r.current="C";r.proc=P()
  self.assertEqual(r.request_execution_mode("LOCAL_ONLY","after_current"),"PENDING_AFTER_CURRENT")
  self.assertEqual(execution_mode(self.s),"CODEX_ALLOWED");self.assertEqual(self.s.meta("pending_execution_mode"),"LOCAL_ONLY")
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
 def test_local_verified_satisfies_dependencies_without_becoming_production_ready(self):
  self.s.add("local","local_ai",{"risk":1},1,"L");self.s.state("L","LOCAL_VERIFIED")
  self.s.add("next","shell",{"command":"true","dependencies":["L"]},2,"N")
  self.assertEqual(self.s.pick({"SHELL":"AVAILABLE","LOCAL_AI":"AVAILABLE"})["id"],"N")
if __name__=="__main__":unittest.main()
