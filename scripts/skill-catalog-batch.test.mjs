import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchSkillTopics, SKILL_TOPIC_QUERIES } from './skill-catalog-batch.mjs';
const allowed = (q) => ({ schemaVersion:1, source:'skills.sh', query:q, candidates:[],
  mayInstallAutomatically:false, mayExecuteAutomatically:false,
  installationPerformed:false, executionPerformed:false });
describe('skills batch: bounded public discovery', () => {
  it('has eight distinct default public topic searches', () => {
    assert.equal(SKILL_TOPIC_QUERIES.length,8);
    assert.equal(new Set(SKILL_TOPIC_QUERIES.map(x=>x.topic)).size,8);
  });
  it('queries sequentially and never installs', async () => {
    const called=[];
    const result=await searchSkillTopics({token:'fixture-token',topics:[{topic:'video',query:'video editing'},{topic:'speech',query:'audio captions'}],searchImpl:async options=>{called.push(options.query);return allowed(options.query)}});
    assert.deepEqual(called,['video editing','audio captions']);
    assert.equal(result.topicsSearched,2);
    assert.equal(result.mayInstallAutomatically,false);
  });
  it('requires a token before issuing any requests', async () => {
    let called=0;
    await assert.rejects(searchSkillTopics({token:'',searchImpl:async ()=>{called++}}),/token/i);
    assert.equal(called,0);
  });
  it('rejects invalid and duplicate query definitions before network requests', async () => {
    let called=0;
    const searchImpl=async()=>{called++};
    for(const topics of [[{topic:'x',query:'ab'}],[{topic:'video',query:'abc\nsecret'}],[{topic:'video',query:'abc'},{topic:'video',query:'def'}]]) {
      await assert.rejects(searchSkillTopics({token:'fixture',topics,searchImpl}));
    }
    assert.equal(called,0);
  });
  it('rejects an adapter that claims installation or returns a different query', async () => {
    for(const mutate of [x=>({...x,mayInstallAutomatically:true}),x=>({...x,query:'other'})]) {
      await assert.rejects(searchSkillTopics({token:'fixture',topics:[{topic:'video',query:'video editing'}],searchImpl:async ({query})=>mutate(allowed(query))}),/Unexpected/);
    }
  });
});
