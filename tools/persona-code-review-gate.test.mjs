import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import {
 allowedSourcePath,validateCritique,determineGate,safeChangedFiles,
} from './persona-code-review-gate.mjs';

const file='apps/web/src/PersonaFactory.tsx';
const issue={
 severity:'MAJOR',file,line:42,
 problem:'Switching the project resets the selected clip without persisting its reference.',
 evidence:'The change clears selectedClip on every project switch.',
 reproduce:'Select a clip, switch to another project, return and inspect selectedClip.',
 suggestedFix:'Restore the clip from the selected project snapshot.',
};
describe('Persona local independent code-review gate',()=>{
 it('allows only code under known review directories',()=>{
  assert.equal(allowedSourcePath(file),true);
  assert.equal(allowedSourcePath('tools/persona-flow.mjs'),true);
  assert.equal(allowedSourcePath('docs/README.md'),false);
  assert.equal(allowedSourcePath('api/.env'),false);
  assert.equal(allowedSourcePath('tools/../private/client.ts'),false);
  assert.equal(allowedSourcePath('tools/credentials.ts'),false);
 });
 it('refuses changed files outside the approved scope',()=>{
  assert.throws(()=>safeChangedFiles([]),/No changed files/);
  assert.throws(()=>safeChangedFiles([file,'assets/private.mov']),/unapproved/);
  assert.deepEqual(safeChangedFiles([file]),[file]);
 });
 it('validates specific review evidence without pretending it was reproduced',()=>{
  assert.deepEqual(validateCritique({issues:[issue]},[file]),[
   {...issue,independentlyReproduced:false},
  ]);
  assert.deepEqual(validateCritique({issues:[]},[file]),[]);
 });
 it('rejects hallucinated paths, unsupported severity and incomplete reasons',()=>{
  assert.throws(()=>validateCritique({issues:[{...issue,file:'api/other.ts'}]},[file]),/malformed/);
  assert.throws(()=>validateCritique({issues:[{...issue,severity:'CRITICAL'}]},[file]),/malformed/);
  assert.throws(()=>validateCritique({issues:[{...issue,evidence:'guess'}]},[file]),/malformed/);
  assert.throws(()=>validateCritique({issues:[issue,issue]},[file]),/Duplicate/);
 });
 it('never calls local reviewer output alone product-ready',()=>{
  assert.equal(determineGate().status,'UNVERIFIED');
  assert.equal(determineGate({reviews:[{issues:[]}]}).status,'UNVERIFIED');
  assert.equal(determineGate({reviews:[{issues:[issue]}]}).status,'NEEDS_FIX');
 });
 it('blocks when existing Observer release evidence fails',()=>{
  const a=determineGate({reviews:[{issues:[]}],observer:{status:'BLOCKED'}});
  assert.equal(a.status,'BLOCKED');
 });
 it('PASS requires both a real independent review and matching external Observer status',()=>{
  const a=determineGate({reviews:[{issues:[]}],
   observer:{status:'ELIGIBLE_FOR_HUMAN_REVIEW'}});
  assert.equal(a.status,'PASS');
  assert.match(a.reason,/human\/product acceptance/);
 });
});
