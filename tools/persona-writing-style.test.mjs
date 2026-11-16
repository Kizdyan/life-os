import assert from 'node:assert/strict';
import {test} from 'node:test';
import {personaGeneratedCopyIssue} from '../packages/core/src/persona-writing-style.mjs';

test('rejects unmistakable AI slogans without rewriting approved author text',()=>{
 assert.deepEqual(personaGeneratedCopyIssue(['Это больше, чем просто ролик']),{
  code:'AI_CLICHE',phrase:'это больше, чем'});
 assert.equal(personaGeneratedCopyIssue(['Он молчит. Потом нажимает первую клавишу.']),null);
 assert.equal(personaGeneratedCopyIssue(['Короткая фраза: «Я всё помню».']),null);
 assert.equal(personaGeneratedCopyIssue(['Это больше   чем реальная история']),null);
 assert.deepEqual(personaGeneratedCopyIssue(['Раскрой свой потенциал!']),{
  code:'AI_CLICHE',phrase:'раскрой свой потенциал'});
});
