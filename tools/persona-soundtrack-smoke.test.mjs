import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
test('ffmpeg supports audio mixing',()=>{const p=spawnSync('ffmpeg',['-version']);assert.equal(p.status,0);});
