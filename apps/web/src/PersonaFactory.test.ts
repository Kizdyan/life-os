import { describe, expect, it } from 'vitest';
import { ideaForImportedBrief } from './PersonaFactory';

const quick={id:'local-project',title:'Новый Reels',angle:'Создать материал из собственных исходников',format:'reel' as const,score:0,source:'quick-start'};
const candidate={sourceTitle:'Один день между театром и музыкой',sourceAngle:'Две профессии одной историей',sourceFormat:'reel'};

describe('brief import identity',()=>{
 it('lets an empty quick-start project adopt a validated candidate identity without changing its project ID',()=>{
  expect(ideaForImportedBrief(quick,candidate,true)).toMatchObject({id:'local-project',title:candidate.sourceTitle,angle:candidate.sourceAngle,format:'reel',source:'imported-brief'});
 });
 it('does not relabel a project that already contains work or malformed imported data',()=>{
  expect(ideaForImportedBrief(quick,candidate,false)).toBe(quick);
  expect(ideaForImportedBrief(quick,{sourceTitle:'Другой'},true)).toBe(quick);
 });
});
