/**
 * Strict, lossless reader for the Architect's 10 timed shot outlines.
 * Shared by the browser adapter and file-backed ProductionJob seeder.
 * Raw source text remains in the JSON fixture; we only derive timed blocks.
 */
export function parseArchitectTimedShots(mainShots){
 if(typeof mainShots!=='string'||!mainShots.trim())throw Error('architect_main_shots_missing');
 const regex=/(\d+)-(\d+)с:\s*([\s\S]*?)(?=\s+\d+-\d+с:|$)/gu;
 const parsed=[...mainShots.matchAll(regex)];
 if(parsed.length<2||parsed.length>30)throw Error('architect_shot_count_invalid');
 let previous=0;
 const scenes=parsed.map((match,index)=>{
  const start=Number(match[1]),end=Number(match[2]),action=match[3].trim();
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start!==previous||end<=start||end-start>60||!action)
   throw Error('architect_shot_timeline_invalid:'+index);
  previous=end;
  return {order:index+1,startSec:start,endSec:end,durationSec:end-start,action};
 });
 const rebuilt=scenes.map(scene=>`${scene.startSec}-${scene.endSec}с: ${scene.action}`).join(' ');
 if(rebuilt!==mainShots.trim())throw Error('architect_shot_source_not_lossless');
 return scenes;
}

export function validateArchitectIdeas(items){
 if(!Array.isArray(items)||items.length!==10)throw Error('exactly_ten_architect_ideas_required');
 const ids=new Set();
 return items.map((item,index)=>{
  if(!item||typeof item!=='object'||item.id!==`reel-${String(index+1).padStart(2,'0')}`||ids.has(item.id))
   throw Error('architect_id_invalid_or_duplicate');
  ids.add(item.id);
  for(const field of ['title','hook','mainShots','broll','music','duration'])
   if(typeof item[field]!=='string'||!item[field].trim())throw Error('architect_field_missing:'+item.id+':'+field);
  const scenes=parseArchitectTimedShots(item.mainShots);
  const durationMatch=/^(\d+)-(\d+) секунд$/u.exec(item.duration);
  if(!durationMatch||scenes.at(-1).endSec<Number(durationMatch[1])||scenes.at(-1).endSec>Number(durationMatch[2]))
   throw Error('architect_duration_mismatch:'+item.id);
  return {item,scenes};
 });
}
