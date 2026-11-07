// The local model writes story beats only. Camera choices are a later Director
// stage and must never be fabricated merely to satisfy a screenplay contract.
export const LOCAL_SCENARIO_RESPONSE_SCHEMA=Object.freeze({
 type:'object',additionalProperties:false,required:['beats'],properties:{
  beats:{type:'array',minItems:3,maxItems:12,items:{type:'object',additionalProperties:false,
   required:['line','action','durationSec'],properties:{
    line:{type:'string',minLength:3,maxLength:220},
    action:{type:'string',minLength:3,maxLength:500},
    durationSec:{type:'number',minimum:1,maximum:10}
   }}}
 }
});

export const LOCAL_SCENARIO_DURATION_REPAIR_SCHEMA=Object.freeze({
 type:'object',additionalProperties:false,required:['durations'],properties:{
  durations:{type:'array',minItems:3,maxItems:12,items:{type:'number',minimum:1,maximum:10}}
 }
});
