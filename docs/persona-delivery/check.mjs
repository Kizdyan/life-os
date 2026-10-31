import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const lockedLines=['Я актёр. И ещё пишу музыку.','И у нас есть проблема.'];
const payoff='Это колыбельная? Это финал триллера.';
const expectedIds=['A01_take01','B01_take01','A02_take01','B02_take01','A03_take01','B03_take01','A04_take01'];

/** Deterministic integrity check for the selected editorial candidate, not archived V1 prose. */
export function validateDelivery({brief,shootingPack,sources}){
 if(!brief||brief.version!==1||brief.sourceFormat!=='reel'||!Array.isArray(brief.script)||!Array.isArray(brief.shots))throw Error('Invalid selected candidate brief');
 if(brief.script.length!==7||brief.shots.length!==7)throw Error('Selected candidate must have seven beats and seven shots');
 const total=brief.script.reduce((sum,beat,index)=>{
  if(beat.order!==index+1||brief.shots[index]?.order!==index+1)throw Error(`Candidate order mismatch at beat ${index+1}`);
  if(!Number.isFinite(beat.durationSec)||beat.durationSec<=0||brief.shots[index].durationSec!==beat.durationSec)throw Error(`Candidate duration mismatch at beat ${index+1}`);
  if(typeof beat.line!=='string'||!beat.line.trim()||typeof beat.action!=='string'||!beat.action.trim())throw Error(`Candidate beat ${index+1} is incomplete`);
  if(!brief.shots[index].action.includes(beat.action))throw Error(`Candidate action mismatch at beat ${index+1}`);
  return sum+beat.durationSec;
 },0);
 if(total!==31)throw Error(`Selected candidate must total 31 seconds, got ${total}`);
 if(brief.script[0].line!==lockedLines[0]||brief.script[1].line!==lockedLines[1])throw Error('Locked A01/B01 wording changed');
 if(brief.script[6].line!==payoff)throw Error('Selected candidate payoff changed');
 if(new Set(brief.script.map(beat=>beat.line)).size!==7)throw Error('Selected candidate repeats a line');
 for(const [index,beat] of brief.script.entries())if(!shootingPack.includes(beat.line))throw Error(`Shooting pack is missing candidate beat ${index+1}`);
 if(!sources||sources.version!==1||!Array.isArray(sources.sources)||sources.sources.length!==7)throw Error('Seven-shot source template is invalid');
 if(sources.sources.map(source=>source.id).join('|')!==expectedIds.join('|'))throw Error('Source template does not match candidate scene order');
 return {beats:brief.script.length,durationSec:total,locked:lockedLines,sourceIds:expectedIds};
}

const here=resolve(fileURLToPath(new URL('.',import.meta.url)));
if(process.argv[1]&&resolve(process.argv[1])===resolve(fileURLToPath(import.meta.url))){
 const brief=JSON.parse(readFileSync(resolve(here,'editorial-candidate-production-brief.json'),'utf8'));
 const shootingPack=readFileSync(resolve(here,'first-real-reel-shooting-pack.md'),'utf8');
 const sources=JSON.parse(readFileSync(resolve(here,'seven-shot-sources.template.json'),'utf8'));
 const result=validateDelivery({brief,shootingPack,sources});
 console.log(`PASS: selected editorial candidate, ${result.beats} ordered beats / ${result.durationSec} seconds, locked A01/B01 and seven matching source slots`);
}
