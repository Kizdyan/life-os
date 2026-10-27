export type PersonaIdeaFormat =
  | "carousel"
  | "photo"
  | "reel"
  | "short"
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
  aspectRatio: "9:16";
  durationSec: number;
  instruction: string;
}

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

  return {
    version: 1,
    ideaId: idea.id,
    sourceFormat: idea.format,
    hook: {
      firstSeconds: hook,
      visual: "Крупный план, взгляд в объектив до первой реплики; без заставки.",
      delivery: "Начать в первые две секунды, говорить спокойно и без ускорения.",
    },
    script: [
      {
        order: 1,
        durationSec: 4,
        line: hook,
        action: "Нажать запись, выдержать короткую паузу и произнести хук в объектив.",
      },
      {
        order: 2,
        durationSec: 18,
        line: idea.angle,
        action: "Показать один предмет или действие из процесса в момент объяснения; не добавлять непроверенные детали.",
      },
      {
        order: 3,
        durationSec: 8,
        line: "Сохраните эту мысль и попробуйте применить её в своей практике.",
        action: "Вернуться в крупный план, закончить фразу и оставить полсекунды тишины перед остановкой записи.",
      },
    ],
    shots: [
      {
        order: 1,
        durationSec: 4,
        framing: "close-up",
        angle: "На уровне глаз",
        cameraMovement: "Статичный кадр на штативе или устойчивой опоре",
        lighting: "Мягкий фронтальный свет под углом 45°; фон темнее лица.",
        action: "Произнести хук без заставки и без склейки до конца фразы.",
      },
      {
        order: 2,
        durationSec: 18,
        framing: "medium",
        angle: "Три четверти, чтобы были видны руки и рабочее действие",
        cameraMovement: "Один медленный переход в деталь только в момент ключевого действия",
        lighting: "Сохранить направление света из первого кадра; избегать смешения цветовых температур.",
        action: "Сопроводить объяснение одним демонстрационным действием из темы идеи.",
      },
      {
        order: 3,
        durationSec: 8,
        framing: "close-up",
        angle: "На уровне глаз",
        cameraMovement: "Статичный кадр",
        lighting: "Тот же мягкий ключевой свет, что в первом кадре.",
        action: "Закончить мысль, сделать короткую паузу и остановить запись.",
      },
    ],
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
      transitions: "Жёсткие склейки по завершённым фразам; не использовать декоративные переходы без смысловой причины.",
      subtitles: {
        instruction: "Субтитры синхронны с речью, максимум две строки, высокий контраст и безопасные поля для интерфейса платформы.",
        maxCharactersPerLine: 42,
      },
      color: "Нейтральная коррекция экспозиции и баланса белого; сохранить естественный тон кожи и фактуру изображения.",
    },
    adaptations: {
      reels: {
        aspectRatio: "9:16",
        durationSec: 30,
        instruction: "Оставить хук в первом кадре и не размещать титры под нижней панелью Reels.",
      },
      shorts: {
        aspectRatio: "9:16",
        durationSec: 30,
        instruction: "Сохранить вертикальный кадр и закончить без внешнего клиффхэнгера после завершённой мысли.",
      },
      vkClips: {
        aspectRatio: "9:16",
        durationSec: 30,
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
