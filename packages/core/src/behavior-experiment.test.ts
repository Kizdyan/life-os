import { describe, expect, it } from "vitest";
import { evaluateBehaviorExperiment, mayPromoteExperimentToRule, type BehaviorExperiment } from "./behavior-experiment";
function exp(overrides:Partial<BehaviorExperiment>={}):BehaviorExperiment{return{id:"exp-1",sourceReferenceId:"reference",hypothesis:"Поведение улучшится",metric:"failure_rate",direction:"decrease",baseline:0.4,target:0.25,observations:[],reversible:true,status:"running",createdAt:"2026-10-01T12:00:00+03:00",...overrides};}
describe("Behavior Experiment Loop",()=>{
 it("succeeds only when the declared target is met",()=>{const r=evaluateBehaviorExperiment(exp({observations:[0.3,0.22,0.2]}));expect(r.status).toBe("succeeded");expect(r.measuredValue).toBeCloseTo(0.24);expect(r.autoPromoteToRule).toBe(false);});
 it("keeps too little evidence inconclusive",()=>{expect(evaluateBehaviorExperiment(exp({observations:[0.2]})).status).toBe("inconclusive");});
 it("rejects irreversible autonomous experiments",()=>{expect(()=>evaluateBehaviorExperiment(exp({reversible:false}))).toThrow("reversible");});
 it("rejects an unknown runtime direction instead of treating it as increase",()=>{expect(()=>evaluateBehaviorExperiment(exp({direction:"sideways" as any,observations:[0.5,0.6,0.7]}))).toThrow("direction");});
 it("requires explicit approval before promotion",()=>{const r=evaluateBehaviorExperiment(exp({observations:[0.2,0.2,0.2]}));expect(mayPromoteExperimentToRule({result:r,explicitlyApproved:false})).toBe(false);expect(mayPromoteExperimentToRule({result:r,explicitlyApproved:true})).toBe(true);});
});
