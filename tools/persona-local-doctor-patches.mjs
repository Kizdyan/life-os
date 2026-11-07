/**
 * Assemble a complete Persona screenplay from small, untrusted local-model
 * patches. Author-locked and unrequested beats are copied exclusively from
 * the saved source, NEVER transcribed by the model.
 */
const fields=new Set(['beatIndex','line','action','durationSec']);
function text(value,name,max=1400){
 if(typeof value!=='string'||value.trim().length<3||value.length>max)
  throw Error(`Patch: invalid ${name}`);
 return value;
}
function same(a,b){
 return a.purpose===b.purpose&&a.line===b.line&&a.action===b.action&&a.durationSec===b.durationSec;
}
export function assembleDoctorPatches(task,candidate){
 if(!task||!Array.isArray(task.beats)||!Array.isArray(task.targetIndices)||
    !Array.isArray(task.lockedIndices))throw Error('Patch: invalid saved task');
 if(!candidate||!Array.isArray(candidate.patches)||candidate.patches.length<1||
    candidate.patches.length>task.targetIndices.length)throw Error('Patch: expected changed target scenes only');
 const changeSummary=text(candidate.changeSummary,'changeSummary');
 const original=task.beats;
 const next=original.map(beat=>({...beat}));
 const seen=new Set();
 for(const patch of candidate.patches){
  const index=patch?.beatIndex;
  if(!Number.isInteger(index)||index<0||index>=original.length||seen.has(index)||
    !task.targetIndices.includes(index)||task.lockedIndices.includes(index))
   throw Error('Patch: duplicate, locked or unauthorized beat index');
  if(Object.keys(patch).some(key=>!fields.has(key)))
   throw Error('Patch: extra fields are not allowed');
  const beat={
   purpose:original[index].purpose,
   line:text(patch.line,`line ${index+1}`,1000),
   action:text(patch.action,`action ${index+1}`,1000),
   durationSec:patch.durationSec
  };
  if(!Number.isFinite(beat.durationSec)||beat.durationSec<=0||beat.durationSec>90)
   throw Error(`Patch: invalid duration at beat ${index+1}`);
  if(same(beat,original[index]))throw Error(`Patch: unchanged target beat ${index+1}`);
  seen.add(index);next[index]=beat;
 }
 const diff=[...seen].sort((a,b)=>a-b).map(index=>({
  beatIndex:index,before:{...original[index]},after:{...next[index]}
 }));
 for(let index=0;index<original.length;index++){
  if(!seen.has(index)&&!same(original[index],next[index]))
   throw Error('Patch: unauthorized source mutation');
 }
 const total=next.reduce((sum,beat)=>sum+beat.durationSec,0);
 if(total<12||total>90)throw Error('Patch: screenplay duration must remain 12–90 seconds');
 const spoken=next.map(beat=>beat.line.replace(/\s+/gu,' ').trim().toLocaleLowerCase('ru-RU'))
  .filter(line=>!line.startsWith('без реплики'));
 if(new Set(spoken).size!==spoken.length)throw Error('Patch: duplicate spoken dialogue');
 if(next.length>=4&&new Set(next.map(beat=>beat.durationSec)).size===1)
  throw Error('Patch: mechanically uniform duration');
 return {revisedBeats:next,diff,changeSummary,totalDurationSec:total};
}
