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
  /** Immutable snapshot of the input angle used to generate this brief. */
  sourceAngle: string;
  sourceTitle: string;
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
  const isStill = idea.format === "photo" || idea.format === "carousel";
  const script = isStill ? [] : buildSpokenScript(idea, hook);
  const shots = isStill ? [] : buildTimedShots(script);

  return {
    version: 1,
    ideaId: idea.id,
    sourceAngle: idea.angle,
    sourceTitle: idea.title,
    sourceFormat: idea.format,
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
        aspectRatio: "9:16",
        durationSec: shots.reduce((sum, shot) => sum + shot.durationSec, 0),
        instruction: "Оставить хук в первом кадре и не размещать титры под нижней панелью Reels.",
      },
      shorts: {
        aspectRatio: "9:16",
        durationSec: shots.reduce((sum, shot) => sum + shot.durationSec, 0),
        instruction: "Сохранить вертикальный кадр и закончить без внешнего клиффхэнгера после завершённой мысли.",
      },
      vkClips: {
        aspectRatio: "9:16",
        durationSec: shots.reduce((sum, shot) => sum + shot.durationSec, 0),
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

function buildSpokenScript(idea: PersonaProductionIdea, hook: string): PersonaProductionBrief["script"] {
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
