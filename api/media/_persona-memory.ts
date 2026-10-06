import type { MediaStateStore } from '../../packages/core/src/media-state-store.js';
import type { PersonaMemoryRuleSource } from '../../packages/core/src/persona-state.js';

function normalizeRule(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function ruleId(rule: string): string {
  return `rule:${encodeURIComponent(rule.toLocaleLowerCase('ru-RU'))}`;
}

export async function loadPersonaRules(store: MediaStateStore | null): Promise<string[]> {
  if (!store) return [];
  const rules = await store.listPersonaMemoryRules();
  return rules
    .slice()
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
    .map(item => item.rule);
}

export async function persistPersonaRules(
  store: MediaStateStore | null,
  rawRules: unknown,
  source: PersonaMemoryRuleSource,
  updatedAt: string,
): Promise<string[]> {
  if (!store || !Array.isArray(rawRules)) return [];
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawRules) {
    const rule = normalizeRule(raw);
    if (!rule) continue;
    const id = ruleId(rule);
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(rule);
    await store.savePersonaMemoryRule({ id, rule, source, updatedAt });
    if (normalized.length >= 80) break;
  }
  return normalized;
}
