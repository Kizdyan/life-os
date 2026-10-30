// The local model writes story beats only. Camera choices are a later Director
// stage and must never be fabricated merely to satisfy a screenplay contract.
export const LOCAL_SCENARIO_RESPONSE_SCHEMA=Object.freeze({
 type:'object',additionalProperties:false,required:['review','beats'],properties:{
  review:{type:'object',additionalProperties:false,required:['dramaturg','director','producer'],properties:{
   dramaturg:{type:'array',minItems:1,maxItems:4,items:{type:'string',minLength:3,maxLength:500}},
   director:{type:'array',minItems:1,maxItems:4,items:{type:'string',minLength:3,maxLength:500}},
   producer:{type:'array',minItems:1,maxItems:4,items:{type:'string',minLength:3,maxLength:500}}
  }},
  beats:{type:'array',minItems:3,maxItems:12,items:{type:'object',additionalProperties:false,
   required:['line','action','durationSec'],properties:{
    line:{type:'string',minLength:3,maxLength:220},
    action:{type:'string',minLength:3,maxLength:500},
    durationSec:{type:'number',minimum:1,maximum:10}
   }}}
 }
});
