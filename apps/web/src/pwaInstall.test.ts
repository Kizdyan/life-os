import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('apps/web/index.html', 'utf8');
const manifest = JSON.parse(readFileSync('apps/web/public/manifest.webmanifest', 'utf8')) as {
  id?: string;
  scope?: string;
  start_url?: string;
  display?: string;
  orientation?: string;
  icons?: Array<{ src?: string; sizes?: string; type?: string; purpose?: string }>;
};
const serviceWorker = readFileSync('apps/web/public/sw.js', 'utf8');
const css = readFileSync('apps/web/src/app.css', 'utf8');

describe('iPhone PWA shell', () => {
  it('declares iOS standalone metadata and an install icon', () => {
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="Life OS"');
    expect(html).toContain('rel="apple-touch-icon" href="/life-os-icon.svg"');
  });

  it('uses a stable standalone manifest for Home Screen launches', () => {
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.orientation).toBe('portrait-primary');
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ src: '/life-os-icon.svg', type: 'image/svg+xml', purpose: 'any maskable' }),
    ]));
  });

  it('keeps an offline navigation shell and avoids caching API responses', () => {
    expect(serviceWorker).toContain("const SHELL=['/','/manifest.webmanifest','/life-os-icon.svg']");
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')");
    expect(serviceWorker).toContain("request.mode==='navigate'");
    expect(serviceWorker).toContain("caches.match('/')");
    expect(serviceWorker).toContain('self.skipWaiting()');
    expect(serviceWorker).toContain('self.clients.claim()');
  });

  it('falls back to the installed shell when a protected preview returns a non-success response', () => {
    expect(serviceWorker).toContain("return caches.match('/').then((cached)=>cached||response)");
  });

  it('respects iPhone safe areas and touch ergonomics', () => {
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('env(safe-area-inset-bottom)');
    expect(css).toContain('min-height:100dvh');
    expect(css).toContain('touch-action:manipulation');
    expect(css).toContain('font-size:16px');
  });
});
