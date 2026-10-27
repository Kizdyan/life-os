export type PersonaIdeaFormat =
  | "carousel"
  | "photo"
  | "reel"
  | "short"
  | "sketch"
  | "story";

export interface PersonaProductionIdea {
  id: string;
  title: string;
  angle: string;
  format: PersonaIdeaFormat;
}

export interface PersonaProductionBriefInput {
  idea: PersonaProductionIdea;
  /**
   * Facts already approved by the author. The brief may reference these facts,
   * but does not infer additional biography, events, or achievements.
   */
  sourceFacts?: readonly string[];
}

export interface PersonaProductionBrief {
  version: 1;
  ideaId: string;
  sourceFormat: PersonaIdeaFormat;
  /**
   * A format-specific deliverable. Script and shots remain available for
   * timed formats; still formats deliberately use cards or photo direction
   * rather than pretending that a video plan exists.
   */
  formatPlan: PersonaFormatPlan;
  hook: {
    firstSeconds: string;
    visual: string;
    delivery: string;
  };
  script: Array<{
    order: number;
    durationSec: number;
    line: string;
    action: string;
  }>;
  shots: Array<{
    order: number;
    durationSec: number;
    framing: "close-up" | "medium" | "detail";
    angle: string;
    cameraMovement: string;
    lighting: string;
    action: string;
  }>;
  capture: {
    props: string[];
    wardrobe: string;
    location: string;
    lighting: string;
    audio: {
      recording: string;
      processing: string;
    };
  };
  postProduction: {
    transitions: string;
    subtitles: {
      instruction: string;
      maxCharactersPerLine: number;
    };
    color: string;
  };
  adaptations: {
    reels: PlatformAdaptation;
    shorts: PlatformAdaptation;
    vkClips: PlatformAdaptation;
  };
  /** The only factual material supplied to this deterministic brief builder. */
  factReferences: string[];
}

export interface PlatformAdaptation {
  aspectRatio: "9:16" | "4:5";
  durationSec: number;
  instruction: string;
}

export type PersonaFormatPlan =
  | {
      kind: "vertical_video";
      targetDurationSec: number;
      pacing: string;
      ending: string;
    }
  | {
      kind: "acting_sketch";
      characters: Array<{ name: string; objective: string }>;
      conflict: string;
      comicTurn: string;
      ending: string;
    }
  | {
      kind: "carousel_cards";
      cards: Array<{
        order: number;
        heading: string;
        body: string;
        visualDirection: string;
      }>;
    }
  | {
      kind: "photo_concept";
      composition: string;
      subjectAction: string;
      lighting: string;
      colorTreatment: string;
    }
  | {
      kind: "story_sequence";
      frames: Array<{
        order: number;
        durationSec: number;
        visual: string;
        text: string;
      }>;
    };

/**
 * Builds a concrete, camera-ready production brief from an existing Persona
 * idea. It deliberately uses only the idea wording and explicit source facts;
 * it never fills gaps with a biography, achievement, date, or event.
 */
export function buildPersonaProductionBrief(
  input: PersonaProductionBriefInput,
): PersonaProductionBrief {
  const idea = normalizeIdea(input.idea);
  const factReferences = normalizeFacts(input.sourceFacts ?? []);
  const hook = `Сразу в кадр: «${idea.title}».`;
  const formatPlan = buildFormatPlan(idea, hook);
  const script = buildScript(idea, hook, formatPlan);
  const isStill = formatPlan.kind === "carousel_cards" || formatPlan.kind === "photo_concept";
  const shots = isStill ? [] : buildTimedShots(script);
  const totalDurationSec = shots.reduce((sum, shot) => sum + shot.durationSec, 0);
  const aspectRatio = isStill ? "4:5" : "9:16";

  return {
    version: 1,
    ideaId: idea.id,
    sourceFormat: idea.format,
    formatPlan,
    hook: {
      firstSeconds: isStill ? idea.title : hook,
      visual: isStill ? "Статичная композиция с читаемой визуальной иерархией." : "Крупный план, взгляд в объектив до первой реплики; без заставки.",
      delivery: isStill ? "Текст на изображении не должен маскироваться под озвучку." : "Начать в первые две секунды, говорить спокойно и без ускорения.",
    },
    script,
    shots,
    capture: {
      props: ["Телефон или камера", "Штатив или устойчивая опора", "Предмет из реального рабочего процесса, если он нужен для объяснения"],
      wardrobe: "Однотонная одежда без мелкого контрастного рисунка; выбрать то, в чём автор обычно работает.",
      location: "Тихое реальное рабочее место автора с нейтральным, неотвлекающим фоном.",
      lighting: "Мягкий фронтальный источник на уровне чуть выше глаз; не смешивать дневной и холодный искусственный свет.",
      audio: {
        recording: "Записать 10 секунд комнатного тона; держать микрофон близко к говорящему и отключить шумные приборы.",
        processing: "Сохранить естественный голос; убрать только постоянный шум и проверить разборчивость перед экспортом.",
      },
    },
    postProduction: {
      transitions: isStill ? "Не применимо к статичному изображению; нужен отдельный визуальный редактор." : "Жёсткие склейки по завершённым фразам; не использовать декоративные переходы без смысловой причины.",
      subtitles: {
        instruction: "Субтитры синхронны с речью, максимум две строки, высокий контраст и безопасные поля для интерфейса платформы.",
        maxCharactersPerLine: 42,
      },
      color: "Нейтральная коррекция экспозиции и баланса белого; сохранить естественный тон кожи и фактуру изображения. Не изменять черты лица, очки и геометрию без согласования.",
    },
    adaptations: {
      reels: {
        aspectRatio,
        durationSec: totalDurationSec,
        instruction: isStill
          ? "Экспортировать карточки или фото 4:5; не обрезать лицо и ключевой текст в интерфейсе Instagram."
          : "Оставить хук в первом кадре и не размещать титры под нижней панелью Reels.",
      },
      shorts: {
        aspectRatio: "9:16",
        durationSec: totalDurationSec,
        instruction: "Сохранить вертикальный кадр и закончить без внешнего клиффхэнгера после завершённой мысли.",
      },
      vkClips: {
        aspectRatio: "9:16",
        durationSec: totalDurationSec,
        instruction: "Сохранить вертикальный экспорт и проверить читаемость первого титра в ленте VK Клипов.",
      },
    },
    factReferences,
  };
}

function normalizeIdea(idea: PersonaProductionIdea): PersonaProductionIdea {
  const id = requireText(idea.id, "idea.id");
  const title = requireText(idea.title, "idea.title");
  const angle = requireText(idea.angle, "idea.angle");
  return { ...idea, id, title, angle };
}

function normalizeFacts(facts: readonly string[]): string[] {
  return facts.map((fact, index) => requireText(fact, `sourceFacts[${index}]`));
}

function requireText(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} must be a non-empty string`);
  return normalized;
}

/** Conservative speech estimate at 120 words/minute plus a two-second pause. */
function spokenSeconds(line: string): number {
  const words = line.trim().split(/\s+/u).filter(Boolean).length;
  return Math.max(3, Math.ceil(words / 2) + 2);
}

function buildScript(
  idea: PersonaProductionIdea,
  hook: string,
  formatPlan: PersonaFormatPlan,
): PersonaProductionBrief["script"] {
  if (formatPlan.kind === "carousel_cards" || formatPlan.kind === "photo_concept") return [];
  if (formatPlan.kind === "acting_sketch") {
    return [
      { line: hook, action: "Первый персонаж уже действует; второй возникает в кадре без экспозиции." },
      { line: formatPlan.conflict, action: "Сменить план на ответ второго персонажа и дать конфликту развиться." },
      { line: formatPlan.comicTurn, action: "Сделать короткую паузу перед поворотом; реакция важнее объяснения." },
      { line: formatPlan.ending, action: "Вернуть общий план и закончить на завершённом действии." },
    ].map((part, index) => ({ order: index + 1, durationSec: spokenSeconds(part.line), ...part }));
  }
  if (formatPlan.kind === "story_sequence") {
    return formatPlan.frames.map((frame) => ({
      order: frame.order,
      durationSec: frame.durationSec,
      line: frame.text,
      action: frame.visual,
    }));
  }
  const parts = [
    { line: hook, action: "Начать с конкретного визуального действия; реплика в первые секунды." },
    { line: idea.angle, action: "Показать действие или предмет, относящийся к идее; не добавлять неподтверждённых деталей." },
    { line: "Показать результат или реакцию без навязанного призыва подписаться.", action: "Завершить визуальным результатом или реакцией, а не универсальным CTA." },
  ];
  return parts.map((part, index) => ({
    order: index + 1,
    durationSec: spokenSeconds(part.line),
    line: part.line,
    action: part.action,
  }));
}

function buildFormatPlan(idea: PersonaProductionIdea, hook: string): PersonaFormatPlan {
  switch (idea.format) {
    case "reel":
    case "short":
      return {
        kind: "vertical_video",
        targetDurationSec: 30,
        pacing: "Одна мысль на кадр; действие в первом плане, короткая пауза перед финалом.",
        ending: "Завершить наблюдением или видимым результатом, не рекламным призывом.",
      };
    case "sketch":
      return {
        kind: "acting_sketch",
        characters: [
          { name: "Персонаж А", objective: "Начать действие немедленно." },
          { name: "Персонаж Б", objective: "Остановить поспешное решение." },
        ],
        conflict: idea.angle,
        comicTurn: "Поворот строится на том, что пауза неожиданно оказывается действием, а не отказом.",
        ending: "Оба персонажа фиксируют новый выбор короткой реакцией без дополнительной морали.",
      };
    case "carousel":
      return {
        kind: "carousel_cards",
        cards: [
          { order: 1, heading: idea.title, body: "Первый тезис должен читаться за одно касание.", visualDirection: "Крупная типографика и один предмет из реального процесса." },
          { order: 2, heading: "Наблюдение", body: idea.angle, visualDirection: "Один чистый кадр действия, без декоративного коллажа." },
          { order: 3, heading: "Напряжение", body: "Покажите, что обычно мешает применить это на практике.", visualDirection: "Контрастный, но спокойный второй ракурс того же процесса." },
          { order: 4, heading: "Действие", body: "Сформулируйте один небольшой шаг, который можно сделать сегодня.", visualDirection: "Руки, инструмент или заметка в кадре — без стоковых метафор." },
          { order: 5, heading: "Финал", body: "Оставьте законченную мысль, а не просьбу о подписке.", visualDirection: "Свободное поле вокруг текста и спокойный завершающий кадр." },
        ],
      };
    case "photo":
      return {
        kind: "photo_concept",
        composition: "Вертикальный портрет 4:5: лицо или действие в верхних двух третях, с чистым фоном и местом для одного короткого заголовка.",
        subjectAction: idea.angle,
        lighting: "Один мягкий направленный источник; сохранить естественную фактуру кожи, очки и геометрию лица.",
        colorTreatment: "Выправить только экспозицию и баланс белого; не менять внешность, черты лица или пропорции тела.",
      };
    case "story":
      return {
        kind: "story_sequence",
        frames: [
          { order: 1, durationSec: 4, visual: "Вертикальный крупный план без заставки.", text: hook },
          { order: 2, durationSec: 6, visual: "Деталь реального действия или инструмента.", text: idea.angle },
          { order: 3, durationSec: 4, visual: "Спокойный финальный кадр с безопасным полем для стикера.", text: "Закончить мысль и оставить место для ответа зрителя." },
        ],
      };
  }
}

function buildTimedShots(script: PersonaProductionBrief["script"]): PersonaProductionBrief["shots"] {
  return script.map((beat, index) => ({
    order: index + 1,
    durationSec: beat.durationSec,
    framing: (index === 1 ? "medium" : "close-up") as "medium" | "close-up",
    angle: index === 1 ? "Три четверти; руки и действие в кадре" : "На уровне глаз",
    cameraMovement: index === 1 ? "Смысловой переход на деталь" : "Статичный кадр",
    lighting: "Единая цветовая температура; мягкий ключевой свет",
    action: beat.action,
  }));
}
