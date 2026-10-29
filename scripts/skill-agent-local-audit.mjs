#!/usr/bin/env node
/** Read-only project-local Skill manifest audit; NOT an agent auth/runtime probe. */
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const SKILL_ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const SOURCES = Object.freeze([
  {agent:'codex', dir:'.agents'},
  {agent:'claude-code', dir:'.claude'},
]);
const nameIsSafe = name => typeof name === 'string' && SKILL_ID.test(name);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function inspectOne(root, {agent, dir}, skill) {
  const result = { agent, skill, status:'missing', manifestSha256:null, path:null,
    authorization:'unverified', runtimeLoaded:false, executionVerified:false };
  const parts = [dir, 'skills', skill, 'SKILL.md'];
  let at = root;
  try {
    for (let i = 0; i < parts.length; i++) {
      at = join(at, parts[i]);
      const state = await lstat(at);
      if (state.isSymbolicLink() || (i < parts.length-1 && !state.isDirectory()) ||
        (i === parts.length-1 && !state.isFile())) {
        result.status='unsafe_path';return result;
      }
    }
    const bytes = await readFile(at);
    if (bytes.length > 65_536 || bytes.includes(0)) {result.status='invalid_manifest';return result;}
    const manifest = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    const match = manifest.match(/^---\r?\nname:\s*([^\r\n]+)\r?\ndescription:\s*([^\r\n]+)\r?\n---\r?\n/);
    if (!match || match[1].trim() !== skill ||
        match[2].trim().length < 10 || match[2].trim().length > 500 ||
        /[\x00-\x1f\x7f]/.test(match[2])) {
      result.status='invalid_manifest';return result;
    }
    result.path = parts.join('/');
    result.manifestSha256 = sha256(bytes);
    result.status = 'manifest_present';
    return result;
  } catch (e) {
    if (e.code === 'ENOENT') return result;
    if (e instanceof TypeError && /encoded data/.test(e.message)) {
      result.status='invalid_manifest'; return result;
    }
    result.status='unreadable'; return result;
  }
}

export async function auditProjectAgentSkills(root, skill='life-os-skill-discovery') {
  if (!nameIsSafe(skill)) throw Error('Unsafe Skill name');
  const canonical = await realpath(resolve(root));
  const state = await lstat(canonical);
  if (!state.isDirectory() || state.isSymbolicLink()) throw Error('Project root is not an ordinary directory');
  const agents = [];
  for (const item of SOURCES) agents.push(await inspectOne(canonical,item,skill));
  const present = agents.filter(x=>x.status==='manifest_present');
  const contentsMatch = present.length===2 && present[0].manifestSha256===present[1].manifestSha256;
  return {schemaVersion:1,kind:'skill-agent-local-audit',skill,
    agents,contentsMatch,
    status: contentsMatch?'matching_local_manifests':'not_ready',
    providerAuthorizationVerified:false, runtimeInvocationVerified:false,
    humanReviewRequired:true, mayInstallAutomatically:false,
    mayExecuteAutomatically:false, installationPerformed:false, executionPerformed:false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length > 4) {console.error('Usage: npm run skills:agents -- [checkout] [skill-name]');process.exitCode=2;}
  else auditProjectAgentSkills(process.argv[2]??'.',process.argv[3]??'life-os-skill-discovery')
    .then(r=>{process.stdout.write(JSON.stringify(r,null,2)+'\n'); if(r.status!=='matching_local_manifests')process.exitCode=1;})
    .catch(()=>{console.error('Local agent skill audit failed');process.exitCode=2;});
}
