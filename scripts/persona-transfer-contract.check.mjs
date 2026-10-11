import test from 'node:test';
import assert from 'node:assert/strict';
import {partCount,partLength,missingParts,TRANSFER_CHUNK_BYTES,TRANSFER_MAX_BYTES} from '../packages/core/src/persona-transfer-contract.mjs';
test('bounded 2MiB chunks handle real and large declared sizes',()=>{
 assert.equal(partCount(TRANSFER_MAX_BYTES),2560);
 assert.equal(partLength(TRANSFER_MAX_BYTES,2559),TRANSFER_CHUNK_BYTES);
 assert.equal(partCount(TRANSFER_CHUNK_BYTES+1),2);
 assert.equal(partLength(TRANSFER_CHUNK_BYTES+1,1),1);
 for(const n of [0,-1,TRANSFER_MAX_BYTES+1,Number.MAX_SAFE_INTEGER,NaN])assert.throws(()=>partCount(n));
});
test('duplicate, out-of-range and missing receipts fail closed',()=>{
 assert.deepEqual(missingParts(TRANSFER_CHUNK_BYTES*3,[0,2]),[1]);
 for(const x of [[0,0],[0,3],[-1],['0'],[0,1,2,3]])assert.throws(()=>missingParts(TRANSFER_CHUNK_BYTES*3,x));
});
