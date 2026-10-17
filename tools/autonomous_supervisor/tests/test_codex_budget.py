import json,sys,time,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))

from codex_budget import evaluate_budget,normalize_rate_limits,read_rate_limits

class CodexBudgetTests(unittest.TestCase):
 def response(self,short_used=23,weekly_used=66):
  return {"ordinaryUsageAllowed":True,"rateLimits":{"primary":None,"secondary":None},"rateLimitsByLimitId":{"codex":{
   "limitId":"codex","primary":{"usedPercent":short_used,"windowDurationMins":300,"resetsAt":2000},
   "secondary":{"usedPercent":weekly_used,"windowDurationMins":10080,"resetsAt":9000}}}}
 def test_normalizes_used_percent_as_consumed_and_prefers_multibucket_view(self):
  snap=normalize_rate_limits(self.response(),1000)
  self.assertEqual(snap["source"],"codex_app_server")
  self.assertEqual(snap["short"]["remainingPercent"],77)
  self.assertEqual(snap["weekly"]["remainingPercent"],34)
  self.assertEqual(snap["short"]["resetsAt"],2000)
 def test_missing_or_malformed_windows_remain_unknown(self):
  snap=normalize_rate_limits({"rateLimits":{"primary":{"usedPercent":150}}},1000)
  self.assertIsNone(snap["short"]);self.assertIsNone(snap["weekly"])
  self.assertEqual(evaluate_budget(snap,{}, {},1001)["state"],"UNKNOWN")
 def test_weekly_user_reserve_blocks_work_even_when_short_window_has_capacity(self):
  snap=normalize_rate_limits(self.response(short_used=10,weekly_used=85),1000)
  policy={"shortReservePercent":10,"weeklyReservePercent":20,"staleAfterSeconds":600,"cautionPercent":10}
  decision=evaluate_budget(snap,policy,{"shortPercent":2,"weeklyPercent":1},1001)
  self.assertEqual(decision["state"],"DRAIN");self.assertIn("weekly_reserve",decision["reasons"])
 def test_estimated_cost_enters_caution_before_reserve_is_consumed(self):
  snap=normalize_rate_limits(self.response(short_used=70,weekly_used=60),1000)
  policy={"shortReservePercent":10,"weeklyReservePercent":20,"staleAfterSeconds":600,"cautionPercent":10}
  decision=evaluate_budget(snap,policy,{"shortPercent":12,"weeklyPercent":12},1001)
  self.assertEqual(decision["state"],"CAUTION")
 def test_stale_snapshot_and_backend_denial_are_conservative(self):
  snap=normalize_rate_limits(self.response(),1000)
  self.assertEqual(evaluate_budget(snap,{"staleAfterSeconds":60},{},1061)["state"],"UNKNOWN")
  denied=self.response();denied["ordinaryUsageAllowed"]=False
  self.assertEqual(evaluate_budget(normalize_rate_limits(denied,1000),{}, {},1001)["state"],"QUOTA_BLOCKED")
 def test_reader_uses_official_rpc_without_inference_request(self):
  seen=[]
  def exchange(command,requests,timeout):
   seen.extend(requests);return [{"id":2,"result":self.response()}]
  result=read_rate_limits(["codex","app-server","--listen","stdio://"],5,exchange)
  self.assertEqual(result["rateLimitsByLimitId"]["codex"]["primary"]["usedPercent"],23)
  self.assertEqual([x.get("method") for x in seen],["initialize","initialized","account/rateLimits/read"])
  self.assertFalse(any(x.get("method") in ("thread/start","turn/start") for x in seen))

if __name__=="__main__":unittest.main()
