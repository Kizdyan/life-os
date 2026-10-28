import test from 'node:test';
import assert from 'node:assert/strict';
import {readRegistry,validateRegistry,getNext,summarize} from './ecosystem-capabilities.mjs';

test('all 43 capability ids are unique and valid',async()=>{
  const registry=await readRegistry();
  assert.equal(registry.capabilities.length,43);
  assert.deepEqual(validateRegistry(registry),[]);
  assert.equal(new Set(registry.capabilities.map(x=>x.id)).size,43);
  assert.deepEqual(summarize(registry).byDomain,{persona:21,ai:13,life:9});
});
test('prioritizes CI, reference UI, real Persona MP4, provider sandbox, finance',async()=>{
  const registry=await readRegistry();
  assert.deepEqual(getNext(registry).map(x=>x.id),[33,1,19,23,35]);
  assert.equal(registry.capabilities.find(x=>x.id===19).status,'partial');
  assert.equal(registry.capabilities.find(x=>x.id===1).status,'draft');
  assert.equal(registry.capabilities.find(x=>x.id===43).status,'deferred');
});
test('fails closed on a duplicate, cycle or missing acceptance criteria',async()=>{
  const registry=await readRegistry();
  const a=structuredClone(registry);
  a.capabilities[0].id=2;
  assert.ok(validateRegistry(a).length>0);
  const b=structuredClone(registry);
  b.capabilities.find(x=>x.id===1).dependsOn=[19];
  b.capabilities.find(x=>x.id===19).dependsOn=[1];
  assert.ok(validateRegistry(b).some(s=>s.includes('cycle')));
  const c=structuredClone(registry);
  c.capabilities.find(x=>x.id===19).acceptance='';
  assert.ok(validateRegistry(c).length>0);
});
test('open PRs and drafts must not be interpreted as shipped',async()=>{
  const registry=await readRegistry();
  assert.ok(registry.statusDisclaimer.includes('not merged or deployed'));
  for(const item of registry.capabilities.filter(x=>x.status==='draft')) {
    assert.ok(item.pr && item.pr>0);
  }
});
