import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const codex = new URL('../.agents/skills/life-os-skill-discovery/SKILL.md', import.meta.url);
const claude = new URL('../.claude/skills/life-os-skill-discovery/SKILL.md', import.meta.url);

describe('Safe first-party cross-agent Skill', () => {
  it('provides identical project-local instructions for Codex and Claude', async () => {
    const [a, b] = await Promise.all([readFile(codex, 'utf8'), readFile(claude, 'utf8')]);
    assert.equal(a, b);
  });
  it('uses discoverable SKILL.md frontmatter', async () => {
    const a = await readFile(codex, 'utf8');
    assert.match(a, /^---\nname: life-os-skill-discovery\ndescription: [^\n]+\n---\n/);
  });
  it('cannot be confused with auto-install instructions', async () => {
    const a = await readFile(codex, 'utf8');
    assert.match(a, /Never automatically run/);
    assert.match(a, /human approval/);
    assert.match(a, /discovery_only/);
    assert.doesNotMatch(a, /(?:npx\s+)?skills\s+add[^\n]*\s(?:-g|--global)\b[^\n]*\s(?:-y|--yes)\b/i);
  });
  it('uses the tested read-only search entrypoint', async () => {
    const a = await readFile(codex, 'utf8');
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    assert.match(a, /npm run skills:find/);
    assert.equal(packageJson.scripts['skills:find'], 'node scripts/skill-catalog-find.mjs');
  });
});
