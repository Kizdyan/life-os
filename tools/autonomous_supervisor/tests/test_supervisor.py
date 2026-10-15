import tempfile,time,unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from supervisor import Store,Runner,critic_clean,critic_command,default_codex_command,repair_prompt,quota,seed_store

class T(unittest.TestCase):
 def setUp(self):self.d=tempfile.TemporaryDirectory();self.s=Store(Path(self.d.name)/"s.db")
 def tearDown(self):self.s.c.close();self.d.cleanup()
 def test_durable_queue(self):
  self.s.add("x","shell",{"command":"true"},7,"J1");self.s.c.close();self.s=Store(Path(self.d.name)/"s.db");self.assertEqual(self.s.jobs()[0]["state"],"QUEUED")
 def test_wait_until_quota_reset(self):
  self.s.add("x","shell",{"command":"true"},7,"J1");self.s.state("J1","WAITING_FOR_CODEX",not_before=time.time()+60);self.assertIsNone(self.s.pick())
 def test_quota_detection(self):self.assertTrue(quota("usage limit reached; reset later"))
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
 def test_ready_state_is_not_recovered(self):
  self.s.add("x","shell",{"command":"true"},7,"J1")
  self.s.state("J1","READY")
  self.assertEqual(self.s.recover_interrupted(),[])
  self.assertEqual(self.s.jobs()[0]["state"],"READY")
if __name__=="__main__":unittest.main()





