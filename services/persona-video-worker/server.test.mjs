import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./server.mjs',import.meta.url),'utf8');

test('video worker requires private bearer authentication',()=>{
 assert.match(source,/PERSONA_WORKER_TOKEN/);
 assert.match(source,/timingSafeEqual/);
 assert.match(source,/if\(!authenticated\(req\)\)/);
});
test('render worker limits upload and queue size',()=>{
 assert.match(source,/PERSONA_MAX_UPLOAD_BYTES/);
 assert.match(source,/PERSONA_MAX_QUEUED_JOBS/);
 assert.match(source,/queue_full/);
});
test('render worker validates video output',()=>{
 assert.match(source,/ffprobe/);
 assert.match(source,/job\.source=await probe/);
 assert.match(source,/job\.output=await probe/);
 assert.match(source,/Output audio missing/);
});
test('worker supports H264 MP4 with streaming download',()=>{
 assert.match(source,/libx264/);
 assert.match(source,/video\/mp4/);
 assert.match(source,/createReadStream/);
});
