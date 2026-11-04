import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {scanVercelApi,assertVercelApiBudget} from './check-vercel-functions.mjs';

test('Vercel scanner includes public routes but never hidden helpers or underscored tests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'persona-vercel-api-'));
 try{
  await mkdir(join(dir,'media'),{recursive:true});
  for(const file of ['status.ts','status.test.ts','_status.test.ts','_helper.ts','index.d.ts'])
   await writeFile(join(dir,'media',file),'export default 1;');
  const result=await scanVercelApi(dir);
  assert.deepEqual(result.functions,['media/status.test.ts','media/status.ts']);
  assert.deepEqual(result.leakedTests,['media/status.test.ts']);
  assert.throws(()=>assertVercelApiBudget(result),/deploy test files/);
  await rm(join(dir,'media','status.test.ts'));
  const clean=await scanVercelApi(dir);
  assert.deepEqual(clean.functions,['media/status.ts']);
  assert.equal(assertVercelApiBudget(clean),1);
  assert.throws(()=>assertVercelApiBudget({
   functions:Array.from({length:13},(_,i)=>'route-'+i+'.ts'),leakedTests:[]
  }),/budget exceeded/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('the real repository API stays within the Vercel Hobby budget',async()=>{
 const dir=new URL('../api/',import.meta.url);
 const result=await scanVercelApi(fileURLToPath(dir));
 assert.equal(assertVercelApiBudget(result),8,'exactly eight intended API routes, no tests');
});
