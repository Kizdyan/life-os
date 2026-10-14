import tempfile,time,unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from supervisor import Store,quota,seed_store

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
if __name__=="__main__":unittest.main()
