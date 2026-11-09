import {describe,it,expect} from 'vitest';
import {CREATIVE_PRODUCER_SYSTEM_PROMPT,ENGINEERING_DELIVERY_SYSTEM_PROMPT,MARKETING_RESEARCH_SYSTEM_PROMPT,personaAgentSystemPrompt} from './persona-agent-system-prompts';

describe('Persona agent system instructions',()=>{
 it('forces Russian answers in all three roles',()=>{
  for(const prompt of [CREATIVE_PRODUCER_SYSTEM_PROMPT,ENGINEERING_DELIVERY_SYSTEM_PROMPT,MARKETING_RESEARCH_SYSTEM_PROMPT]){
   expect(prompt).toContain('Always answer the user in Russian');
  }
 });
 it('preserves an existing endpoint-specific JSON contract as the final instruction',()=>{
  const system=personaAgentSystemPrompt('creative','Return JSON {"title":string}');
  expect(system).toContain('Never fabricate research');
  expect(system.endsWith('Return JSON {"title":string}')).toBe(true);
 });
 it('rejects an empty runtime contract',()=>{
  expect(()=>personaAgentSystemPrompt('marketing','  ')).toThrow('persona_agent_task_contract_required');
 });
});
