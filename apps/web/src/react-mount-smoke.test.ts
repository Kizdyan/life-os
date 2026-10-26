import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import ErikaSheet from './ErikaSheet';
import PersonaFactory from './PersonaFactory';
import MediaBrainCard from './MediaBrainCard';

afterEach(() => vi.unstubAllGlobals());

function stubBrowser(hash: string) {
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('location', { hash });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
}

describe('Life OS and Persona JSX runtime rendering', () => {
  it('renders Persona route without React is not defined', () => {
    stubBrowser('#persona');
    const markup = renderToString(React.createElement(App));
    expect(markup).toContain('Редакция Persona');
    expect(markup).toContain('Своя идея');
  });

  it('renders Today route without React is not defined', () => {
    stubBrowser('#today');
    const markup = renderToString(React.createElement(App));
    expect(markup).toContain('Сегодня');
    expect(markup).toContain('Эрика');
  });

  it('mounts the individual Persona, Erika and Media Brain components', () => {
    stubBrowser('#today');
    expect(renderToString(React.createElement(PersonaFactory))).toContain('Редакция Persona');
    expect(renderToString(React.createElement(MediaBrainCard))).toContain('Контент-контур');
    expect(renderToString(React.createElement(ErikaSheet, {
      items: [],
      onClose: () => undefined,
      onApplied: () => undefined,
    }))).toContain('Выполнить');
  });
});
