import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

describe('iPhone sleep interval chips do not overlap or clip', () => {
  it('lays out time choices on a wrapping, minmax-zero grid instead of shrinking nowrap flex', () => {
    expect(css).toMatch(/\.sleepWindows>div\{[^}]*display:grid/);
    expect(css).toMatch(/\.sleepWindows>div\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
    expect(css).toMatch(/\.sleepWindows button\{[^}]*min-width:0/);
    expect(css).toMatch(/\.sleepWindows button\{[^}]*white-space:normal/);
    expect(css).toMatch(/\.sleepWindows button\{[^}]*min-height:44px/);
    expect(css).not.toMatch(/\.sleepWindows>div\{[^}]*display:flex/);
  });
});
