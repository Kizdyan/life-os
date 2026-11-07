#!/usr/bin/env node
// Static validation of repo-local workflow skills. No external dependencies.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const root=resolve(process.argv[2]??'.');
const names=['engineering-delivery','marketing-research','creative-production'];
let bad=0;
for(const name of names){
 const path=resolve(root,'.agents','skills',name,'SKILL.md');
 if(!existsSync(path)){console.error(`MISSING ${name}`);bad++;continue;}
 const src=readFileSync(path,'utf8');
 const match=/^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(src);
 const title=match?.[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
 const desc=match?.[1].match(/^description:\s*(.+)$/m)?.[1]?.trim();
 const problems=[];
 if(!match)problems.push('YAML frontmatter missing');
 if(title!==name)problems.push('name does not match directory');
 if(!desc?.startsWith('Use when '))problems.push('description must begin Use when');
 if(src.slice(match?.[0].length??0).trim().length<200)problems.push('body too short');
 if(problems.length){bad++;console.error(`FAIL ${name}: ${problems.join('; ')}`)}else console.log(`PASS ${name}`);
}
process.exitCode=bad?1:0;
