import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criticFamily,independentCritic,chooseIndependentCritic} from './persona-critic-independence.mjs';
test('known explicit model families only; no same-family or OpenAI critic',()=>{
 assert.equal(criticFamily('openai/gpt-test'),'openai');
 assert.equal(criticFamily('router/auto'),null);
 assert.equal(independentCritic('openai/gpt-test','openai/gpt-other').eligible,false);
 assert.equal(independentCritic('anthropic/claude-test','anthropic/claude-other').eligible,false);
 assert.equal(independentCritic('openai/gpt-test','anthropic/claude-test').eligible,true);
 assert.equal(independentCritic('anthropic/claude-test','google/gemini-test').eligible,true);
 assert.equal(independentCritic('anthropic/claude-test','openai/gpt-test').eligible,false);
});
test('candidate routing skips unavailable, unverified, same-family and source-incapable models',()=>{
 const candidates=[
 {model:'anthropic/claude-test',verified:false,available:true,sourceFetch:true},
 {model:'openai/gpt-test',verified:true,available:true,sourceFetch:true},
 {model:'google/gemini-test',verified:true,available:true,sourceFetch:false},
 {model:'deepseek/deepseek-test',verified:true,available:false,sourceFetch:true},
 {model:'google/gemini-other',verified:true,available:true,sourceFetch:true}];
 assert.equal(chooseIndependentCritic('openai/gpt-test',candidates),candidates[4]);
 assert.equal(chooseIndependentCritic('openai/gpt-test',candidates.slice(0,4)),null);
});
