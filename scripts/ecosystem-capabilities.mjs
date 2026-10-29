#!/usr/bin/env node
/**
 * Read-only registry used by Codex and the Life OS ecosystem.
 * Usage: node scripts/ecosystem-capabilities.mjs [check|summary|next|list|show ID] [--domain=persona|ai|life]
 * No network, external actions or file modifications.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';

export const REGISTRY_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/ecosystem-capabilities.json');
const statusValues = new Set(['draft', 'partial', 'planned', 'research', 'deferred', 'blocked']);
const priorities = new Set(['P0', 'P1', 'P2', 'P3']);
const domains = new Set(['persona', 'ai', 'life']);

export function validateRegistry(registry) {
  const errors = [];
  if (!registry || typeof registry !== 'object' || registry.schemaVersion !== 1 || !Array.isArray(registry.capabilities)) {
    throw Error('Invalid ecosystem registry envelope');
  }
  const items = registry.capabilities;
  if (items.length !== 43) errors.push('Expected 43 capabilities');
  const ids = new Set(items.map(item => item.id));
  if (ids.size !== items.length) errors.push('Duplicate capability ids');
  if (Array.from({length:43},(_,i)=>i+1).some(id=>!ids.has(id))) errors.push('Missing ids from 1 to 43');
  for (const entry of items) {
    if (!Number.isInteger(entry.id) || !domains.has(entry.domain) ||
        !statusValues.has(entry.status) || !priorities.has(entry.priority) ||
        !['source_inspected','user_reported'].includes(entry.evidence) ||
        typeof entry.title !== 'string' || !entry.title.trim() ||
        typeof entry.nextAction !== 'string' || !entry.nextAction.trim() ||
        typeof entry.acceptance !== 'string' || !entry.acceptance.trim() ||
        !(entry.pr === null || (Number.isInteger(entry.pr) && entry.pr > 0)) ||
        !Array.isArray(entry.dependsOn)) {
      errors.push('Invalid required fields on capability ' + entry.id);
      continue;
    }
    if (entry.dependsOn.some(id => !ids.has(id) || id === entry.id) ||
        new Set(entry.dependsOn).size !== entry.dependsOn.length) {
      errors.push('Invalid dependencies on capability ' + entry.id);
    }
    if (entry.status === 'draft' && entry.pr === null && entry.id !== 26) {
      errors.push('Draft missing PR reference on capability ' + entry.id);
    }
  }
  const seen = new Set(), inPath = new Set();
  const byId = new Map(items.map(item => [item.id,item]));
  function visit(id) {
    if (inPath.has(id)) { errors.push('Dependency cycle at ' + id); return; }
    if (seen.has(id)) return;
    inPath.add(id);
    for (const dep of byId.get(id)?.dependsOn ?? []) visit(dep);
    inPath.delete(id);
    seen.add(id);
  }
  items.forEach(item => visit(item.id));
  return errors;
}
export async function readRegistry(path=REGISTRY_PATH) {
  const data=JSON.parse(await readFile(path,'utf8'));
  const errors=validateRegistry(data);
  if(errors.length) throw Error('Invalid registry:\n'+errors.join('\n'));
  return data;
}
// Release-first focus: first real Reel; bounded agent Skills efficiency; QA; Instagram approval; lead tracking.\nexport const deliveryOrder = [19,26,33,17,20,21,37,1,22,35,23];
export function getNext(registry) {
  return deliveryOrder.map(id=>registry.capabilities.find(item=>item.id===id));
}
export function summarize(registry) {
  const byStatus=Object.fromEntries([...statusValues].map(s=>[s,registry.capabilities.filter(x=>x.status===s).length]));
  const byDomain=Object.fromEntries([...domains].map(s=>[s,registry.capabilities.filter(x=>x.domain===s).length]));
  return {total:registry.capabilities.length,byStatus,byDomain,focus:deliveryOrder,warning:'A draft PR or preview build is not evidence of a shipped user-facing feature.'};
}

async function main() {
  const args=process.argv.slice(2);
  const command=args.find(arg=>!arg.startsWith('--'))??'summary';
  const domainArg=args.find(arg=>arg.startsWith('--domain='));
  const domain=domainArg?.slice('--domain='.length);
  if(domain && !domains.has(domain)) throw Error('Unknown domain');
  const registry=await readRegistry();
  let data;
  if(command==='check') data={ok:true,count:registry.capabilities.length};
  else if(command==='summary') data=summarize(registry);
  else if(command==='next') data=getNext(registry);
  else if(command==='list') data=registry.capabilities.filter(x=>!domain||x.domain===domain);
  else if(command==='show') {
    const index=args.indexOf('show'),id=Number(args[index+1]);
    if(!Number.isInteger(id)) throw Error('Expected numeric capability id');
    data=registry.capabilities.find(x=>x.id===id);
    if(!data)throw Error('Capability id not found');
  } else throw Error('Unknown command: '+command);
  process.stdout.write(JSON.stringify(data,null,2)+'\n');
}
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
