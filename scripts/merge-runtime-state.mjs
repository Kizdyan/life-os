import fs from'node:fs';
const [remotePath,localPath,outPath]=process.argv.slice(2);if(!remotePath||!localPath||!outPath)throw new Error('usage: remote local out');
const raw=fs.readFileSync(remotePath,'utf8'),match=raw.match(/```json\n([\s\S]*?)\n```/);if(!match)throw new Error('canonical state JSON missing');
const remote=JSON.parse(match[1]),local=JSON.parse(fs.readFileSync(localPath,'utf8'));
const runtimeKeys=['status','phase','checkpoint','heartbeat','lastActivityAt','roles','tests','lastAutomatedQA','errors','retries','recoveries','currentTask','critic','lastRun'];
const merged={...remote};for(const k of runtimeKeys)if(local[k]!==undefined)merged[k]=local[k];
const events=[...(remote.events||[]),...(local.events||[])],seen=new Set();merged.events=events.filter(e=>{const k=JSON.stringify(e);if(seen.has(k))return false;seen.add(k);return true}).slice(-30);
merged.queueSize=(merged.queue||[]).length+(merged.developerTasks||[]).length;
fs.writeFileSync(outPath,JSON.stringify(merged,null,2)+'\n');
