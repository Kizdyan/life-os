import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {
 PERSONA_STRATEGY_FIELDS,defaultPersonaStrategy,isPersonaStrategy,strategyForArchitect,
 strategySnapshot,readPersonaStrategyAudit,currentPersonaStrategyAudit
} from '../packages/core/src/persona-strategy.mjs';
const ideas=JSON.parse(await readFile(new URL('../packages/core/src/persona-architect-ten-reels.json',import.meta.url),'utf8'));
test('seven required fields on ten distinct Architect Reels',()=>{
 assert.equal(PERSONA_STRATEGY_FIELDS.length,7);
 assert.equal(ideas.length,10);
 for(const item of ideas){
  const strategy=strategyForArchitect(item);
  assert.equal(isPersonaStrategy(strategy),true,item.id);
  assert.equal(Object.keys(strategy).length,7);
  assert.match(strategy.mainGoal,/Показать|Продемонстрировать|Передать/i);
 }
 assert.match(strategyForArchitect(ideas[0]).targetAudience,/Режисс/);
 assert.match(strategyForArchitect(ideas[0]).mainGoal,/драматическ/);
});
test('legacy project remains valid; only a real status tied to current content is shown',()=>{
 const project={title:'Последняя сцена',sourceIdea:ideas[0].hook,strategy:strategyForArchitect(ideas[0]),
  scenarioWorkspace:{script:{currentRevision:{beats:[{line:ideas[0].hook,action:'Сидит за роялем',durationSec:2}]}}}};
 const snapshot=strategySnapshot(project);
 assert.equal(currentPersonaStrategyAudit(project),null);
 const audit={version:1,status:'WARNING',recommendation:'Слабо решает задачу профессионального позиционирования',
  provider:'openai',model:'gpt-4.1-mini',snapshot,checkedAt:new Date().toISOString()};
 assert.deepEqual(readPersonaStrategyAudit(audit),audit);
 assert.equal(currentPersonaStrategyAudit({...project,strategyAudit:audit})?.status,'WARNING');
 assert.equal(currentPersonaStrategyAudit({...project,sourceIdea:'Новый вариант',strategyAudit:audit}),null);
 assert.equal(currentPersonaStrategyAudit({...project,scenarioWorkspace:{script:{currentRevision:{beats:[{line:'Правка',action:'Другая игра',durationSec:3}]}}},strategyAudit:audit}),null);
 assert.equal(readPersonaStrategyAudit({...audit,status:'UNVERIFIED'}),null);
 assert.equal(isPersonaStrategy({...defaultPersonaStrategy(),delivery:''}),false);
});
