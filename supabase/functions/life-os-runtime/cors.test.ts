import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('life-os-runtime browser transport contract', () => {
  it('answers CORS preflight without exposing server credentials', () => {
    expect(source).toContain("request.method === 'OPTIONS'");
    expect(source).toContain('Access-Control-Allow-Origin');
    expect(source).toContain('Access-Control-Allow-Headers');
    expect(source).toContain('Access-Control-Allow-Methods');
    expect(source).not.toContain("Access-Control-Allow-Credentials': 'true");
  });
});
