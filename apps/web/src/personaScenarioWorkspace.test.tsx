import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PersonaScenarioWorkspace, { personaScenarioDraftIsDirty } from "./PersonaScenarioWorkspace";
import { createPersonaProject, type PersonaScenarioWorkspace as Workspace } from "./personaProjectStore";
import { approveScenarioScript, createScenarioScript, reviseScenarioScript, suggestScenarioIdeas, validateScenarioResearch } from "../../../packages/core/src/persona-scenario-intelligence";

const research = validateScenarioResearch([{
  id: "reference-1",
  url: "https://www.youtube.com/shorts/acting-reference",
  platform: "youtube",
  observedAt: "2026-10-30T10:00:00.000Z",
  observationStatus: "metadata_only",
  title: "Комедийный актёрский формат",
  evidence: { kind: "manual_link", observedFields: ["url", "title"] },
}]);
const [idea] = suggestScenarioIdeas({ research, creativeProfile: { priorities: ["смысловые склейки"], constraints: ["не копировать"], }, count: 5 });
const draft = createScenarioScript(idea, {
  createdAt: "2026-10-30T10:00:00.000Z",
  beats: [
    { purpose: "hook", line: "Я пришёл на один дубль, но получил три задачи.", action: "Крупный план и пауза.", durationSec: 5 },
    { purpose: "development", line: "Пианино слышит подтекст правки раньше меня.", action: "Переход на руки и клавиши.", durationSec: 8 },
    { purpose: "ending", line: "Лучший дубль начинается, когда я перестаю спорить с задачей.", action: "Реакция в крупном плане.", durationSec: 6 },
  ],
});
const project = createPersonaProject({ id: "scenario-project", title: "Первый Reels", contentType: "reel", sourceIdea: "Один день", now: "2026-10-30T10:00:00.000Z" });

function render(workspace: Workspace) {
  return renderToString(<PersonaScenarioWorkspace
    project={project}
    workspace={workspace}
    creativeProfile={{ priorities: ["смысловые склейки"], constraints: ["не менять внешность"] }}
    onChange={() => undefined}
    onCreateBrief={() => undefined}
  />);
}

describe("Persona Scenario workspace", () => {
  it("preserves whitespace-only unsaved revision reasons consistently with the pending-state guard",()=>{
    const beats=draft.currentRevision.beats;
    expect(personaScenarioDraftIsDirty(beats,beats,'   ')).toBe(true);
    expect(personaScenarioDraftIsDirty(beats,beats,'')).toBe(false);
    expect(personaScenarioDraftIsDirty([...beats.slice(0,-1),{...beats.at(-1)!,line:'New ending'}],beats,'')).toBe(true);
  });

  it("labels an unviewed source honestly and blocks the Production Brief before author approval", () => {
    const markup = render({ version: 1, research, analyses: [], ideas: [idea], selectedIdeaId: idea.id, script: draft });

    expect(markup).toContain("Метаданные ссылки — видео не просмотрено");
    expect(markup).toContain("Предмонтаж спроектирован до съёмки");
    expect(markup).toContain("Монтаж сцены 1");
    expect(markup).toContain("Камера:");
    expect(markup).toContain("Свет:");
    expect(markup).toContain("Актёрская задача:");
    expect(markup).toContain("Цветовой замысел:");
    expect(markup).toContain("Нет подтверждённого исследования Instagram");
    expect(markup).toContain("Perplexity отключён");
    expect(markup).toContain("Абсурдная «проба на роль»");
    expect(markup).toContain("2026-10-07");
    expect(markup).not.toContain("Создать съёмочный бриф");
  });

  it("shows the optional local Script Doctor controls without calling external AI or approving a draft", () => {
    const markup=render({version:1,research,analyses:[],ideas:[idea],selectedIdeaId:idea.id,script:draft});
    expect(markup).toContain("Локальный Script Doctor");
    expect(markup).toContain("Скачать локальное задание");
    expect(markup).toContain("Импорт предложений Script Doctor");
    expect(markup).toContain("Скачать локальное задание");
    expect(markup).toContain("Закрепить");
    expect(markup).not.toContain("Принять как новую версию");
  });

  it("assigns distinct remount keys to history and Script Doctor for the same scenario revision", async () => {
    const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./PersonaScenarioWorkspace.tsx", import.meta.url), "utf8"));
    expect(source).toContain('key={`history:${project.id}:${script.currentRevisionId}`}');
    expect(source).toContain('key={`doctor:${project.id}:${script.currentRevisionId}`}');
  });

  it("reveals saved version history and restore, without manufacturing author approval", () => {
    const revised=reviseScenarioScript(draft,{
      createdAt:"2026-10-30T11:00:00.000Z",
      reason:"Автор изменил финальную реплику",
      beats:draft.currentRevision.beats.map((beat,index)=>index===2?{...beat,line:"Теперь у меня другая концовка."}:beat)
    });
    const markup=render({version:1,research,analyses:[],ideas:[idea],selectedIdeaId:idea.id,script:revised});
    expect(markup).toContain("История сценария");
    expect(markup).toContain("Восстановить эту версию как новый черновик");
    expect(markup).toContain("Теперь у меня другая концовка.");
    expect(markup).not.toContain("Создать съёмочный бриф");
  });

  it("shows an approved version as ready for the existing Production Brief hand-off", () => {
    const approved = approveScenarioScript(draft, { author: "Kostya", comment: "Готово к съёмочному брифу.", approvedAt: "2026-10-30T10:05:00.000Z" });
    const markup = render({ version: 1, research, analyses: [], ideas: [idea], selectedIdeaId: idea.id, script: approved });

    expect(markup).toContain("Версия 1 одобрена");
    expect(markup).toContain("Создать съёмочный бриф");
    expect(markup).not.toMatch(/disabled=""[^>]*>Создать съёмочный бриф/);
  });
});
