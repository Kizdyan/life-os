import {
  buildFormatObservation,
  type FormatMemoryObservation,
} from "./format-memory";

export const PERSONAL_FORMAT_SEEDS: FormatMemoryObservation[] = [
  buildFormatObservation({
    formatKey: "demo-tool",
    label: "Сильный тезис + демонстрация",
    mechanics: [
      "сразу показать результат или необычную возможность",
      "подтвердить тезис экраном или реальным процессом",
      "коротко объяснить, зачем это зрителю",
      "завершить конкретным применением, а не абстрактным обещанием",
    ],
    sourceAssetId: "video-batch-2026-10-01:02",
    userSignal: "saved_reference",
    audienceSignal: "unknown",
    createdAt: "2026-10-01T00:00:00+03:00",
  }),
  buildFormatObservation({
    formatKey: "chronological-story",
    label: "История по этапам времени",
    mechanics: [
      "разбить историю на короткие возрастные или временные этапы",
      "в каждом этапе оставить один поворот",
      "показывать причинную связь между этапами без лишней биографии",
      "финал связать с текущей точкой и следующим направлением",
    ],
    sourceAssetId: "video-batch-2026-10-01:05",
    userSignal: "saved_reference",
    audienceSignal: "unknown",
    createdAt: "2026-10-01T00:00:00+03:00",
  }),
  buildFormatObservation({
    formatKey: "resource-roundup",
    label: "Подборка ресурсов вокруг одной боли",
    mechanics: [
      "начать с одной конкретной проблемы",
      "дать несколько разных ресурсов или подходов",
      "для каждого быстро объяснить, когда он полезен",
      "не превращать подборку в самодиагностику или абсолютную рекомендацию",
    ],
    sourceAssetId: "video-batch-2026-10-01:07",
    userSignal: "saved_reference",
    audienceSignal: "unknown",
    createdAt: "2026-10-01T00:00:00+03:00",
  }),
  buildFormatObservation({
    formatKey: "one-rule-metaphor",
    label: "Одно правило + простая метафора",
    mechanics: [
      "сформулировать одно короткое правило",
      "дать простую визуальную метафору",
      "показать один бытовой пример применения",
      "закончить действием, которое легко выполнить сразу",
    ],
    sourceAssetId: "video-batch-2026-10-01:08",
    userSignal: "saved_reference",
    audienceSignal: "unknown",
    createdAt: "2026-10-01T00:00:00+03:00",
  }),
];
