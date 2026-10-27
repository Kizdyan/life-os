import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import ErikaSheet from './ErikaSheet';
import PersonaFactory, { buildCustomPersonaIdea, buildPersonaProductionWorkflow, PersonaProductionBriefPanel } from './PersonaFactory';
import MediaBrainCard from './MediaBrainCard';
import LocalTaskEditor from './LocalTaskEditor';

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
    expect(markup).toContain('Завтра');
    expect(markup).toContain('Выбрать дату расписания');
    expect(markup).toContain('Резервная копия и перенос данных');
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

describe('Persona creative brief preservation', () => {
  it('sends the complete long brief to the model instead of silently slicing it to 180 chars', () => {
    const details = 'Хочу оригинальный рилс о театральной закулисной ситуации. '+
      'Юмор естественный. '.repeat(15)+
      'Снимать одному на iPhone. Дать конкретные кадры, реплики, свет, монтаж, финал.';
    const idea=buildCustomPersonaIdea(details,'reel');
    expect(idea.title.length).toBeLessThanOrEqual(91);
    expect(idea.angle.length).toBeGreaterThan(180);
    expect(idea.angle).toContain('конкретные кадры, реплики, свет, монтаж, финал.');
    expect(idea.source).toBe('user');
  });
});

describe('Persona Production Engine panel', () => {
  it('shows the deterministic shot brief and editorial gate for a selected idea', () => {
    const pipeline = buildPersonaProductionWorkflow({
      id: 'idea-production-1',
      title: 'Разговор о репетиции',
      angle: 'Показываю подготовку перед записью.',
      format: 'reel',
      score: 90,
    });
    const markup = renderToString(React.createElement(PersonaProductionBriefPanel, {
      pipeline,
      editor: '',
      comment: '',
      factsChecked: false,
      onEditorChange: () => undefined,
      onCommentChange: () => undefined,
      onFactsCheckedChange: () => undefined,
      onDecision: () => undefined,
      onRebuild: () => undefined,
    }));

    expect(pipeline.stage).toBe('QA');
    expect(markup).toContain('Съёмочный бриф');
    expect(markup).toContain('ДЕТЕРМИНИРОВАННЫЙ ШАБЛОН');
    expect(markup).toContain('Нужна ручная проверка фактов');
    expect(markup).toContain('Одобрить для съёмки');
  });
  it('disables approval for a revised angle until the production brief is rebuilt', () => {
    const pipeline = buildPersonaProductionWorkflow({
      id: 'stale-1',
      title: 'Репетиция',
      angle: 'Показываю работу.',
      format: 'reel',
      score: 90,
    });
    const stale = {
      ...pipeline,
      input: { ...pipeline.input, idea: { ...pipeline.input.idea, angle: 'Изменённый смысл сцены.' } },
    };
    const markup = renderToString(React.createElement(PersonaProductionBriefPanel, {
      pipeline: stale,
      editor: 'Редактор',
      comment: 'Проверено',
      factsChecked: true,
      onEditorChange: () => undefined,
      onCommentChange: () => undefined,
      onFactsCheckedChange: () => undefined,
      onDecision: () => undefined,
      onRebuild: () => undefined,
    }));
    expect(markup).toContain('Пересоберите бриф');
    expect(markup).toMatch(/disabled=""[^>]*>Одобрить для съёмки/);
  });

  it('shows a dedicated carousel deliverable and the current revision to the editor', () => {
    const pipeline = buildPersonaProductionWorkflow({
      id: 'carousel-production-1',
      title: 'Три точки входа',
      angle: 'Веду автора от наблюдения к действию.',
      format: 'carousel',
      score: 90,
    });
    const markup = renderToString(React.createElement(PersonaProductionBriefPanel, {
      pipeline,
      editor: '',
      comment: '',
      factsChecked: false,
      onEditorChange: () => undefined,
      onCommentChange: () => undefined,
      onFactsCheckedChange: () => undefined,
      onDecision: () => undefined,
      onRebuild: () => undefined,
    }));

    expect(markup).toMatch(/Ревизия\s*(?:<!-- -->)?1/);
    expect(markup).toContain('Карточки');
    expect(markup).toContain('Первый тезис должен читаться за одно касание.');
  });

});

describe('iPhone editor smoke render', () => {
  it('renders edit form with existing title and exact start/end', () => {
    stubBrowser('#today');
    const item = {
      id: 'local-edit-1', title: 'Репетиция', kind: 'task', status: 'planned' as const,
      planned_start: '2026-10-27T11:00:00+03:00',
      planned_end: '2026-10-27T11:30:00+03:00',
    };
    const markup = renderToString(React.createElement(LocalTaskEditor, {
      item, onSaved: () => undefined, onCancel: () => undefined,
    }));
    expect(markup).toContain('Изменить задачу');
    expect(markup).toContain('Репетиция');
    expect(markup).toContain('2026-10-27');
    expect(markup).toContain('11:00');
    expect(markup).toContain('11:30');
    expect(markup).toContain('Сохранить изменения');
  });
});
