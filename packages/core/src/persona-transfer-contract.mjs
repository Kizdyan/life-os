// Strict transport sizing shared by browser and desktop; no video encoding.
export const TRANSFER_CHUNK_BYTES=2*1024*1024;
export const TRANSFER_MAX_BYTES=5*1024*1024*1024;
export const TRANSFER_MAX_PARTS=Math.ceil(TRANSFER_MAX_BYTES/TRANSFER_CHUNK_BYTES);
export const SHA256_RE=/^[a-f0-9]{64}$/;
export function partCount(bytes){
 if(!Number.isSafeInteger(bytes)||bytes<1||bytes>TRANSFER_MAX_BYTES)throw Error('invalid_transfer_size');
 return Math.ceil(bytes/TRANSFER_CHUNK_BYTES);
}
export function partLength(bytes,index){
 const count=partCount(bytes);
 if(!Number.isSafeInteger(index)||index<0||index>=count)throw Error('invalid_transfer_index');
 return Math.min(TRANSFER_CHUNK_BYTES,bytes-index*TRANSFER_CHUNK_BYTES);
}
export function validPartReceipt(bytes,index,part){
 return !!(part&&part.bytes===partLength(bytes,index)&&SHA256_RE.test(part.sha256));
}
export function missingParts(bytes,received){
 const count=partCount(bytes);
 if(!Array.isArray(received)||received.length>count)throw Error('invalid_transfer_receipts');
 const indexes=new Set();
 for(const v of received){
  if(!Number.isInteger(v)||v<0||v>=count||indexes.has(v))throw Error('invalid_transfer_receipts');
  indexes.add(v);
 }
 const missing=[];
 for(let i=0;i<count;i++)if(!indexes.has(i))missing.push(i);
 return missing;
}
