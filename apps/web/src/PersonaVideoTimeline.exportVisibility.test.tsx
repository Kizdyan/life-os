import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import PersonaVideoTimeline from './PersonaVideoTimeline';

afterEach(() => vi.unstubAllGlobals());

function renderTimeline() {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  return renderToStaticMarkup(createElement(PersonaVideoTimeline, { projectId: 'user-reel-smoke' }));
}

describe('Persona MP4 export discoverability (non-destructive SSR smoke)', () => {
  it('exposes the existing MP4 action outside developer disclosures', () => {
    const html = renderTimeline();
    const headline = html.indexOf('Создать готовое видео MP4');
    const action = html.indexOf('Скачать готовый MP4');
    const advanced = html.indexOf('Технические сведения о локальном экспорте');
    expect(headline).toBeGreaterThan(0);
    expect(action).toBeGreaterThan(headline);
    expect(advanced).toBeGreaterThan(action);
    expect(html.match(/Скачать готовый MP4/g)).toHaveLength(1);
  });

  it('keeps the existing JSON export and does not falsely advertise iPhone MP4 export', () => {
    const html = renderTimeline();
    expect(html).toContain('Сохранить монтажный план');
    expect(html).toContain('На опубликованном сайте и непосредственно на iPhone');
    expect(html).toContain('npm run media:bridge');
  });

  it('keeps rendering disabled without video sources or a local workstation', () => {
    const html = renderTimeline();
    expect(html).toMatch(/disabled=""[^>]*>Скачать готовый MP4<\/button>/);
  });
});
