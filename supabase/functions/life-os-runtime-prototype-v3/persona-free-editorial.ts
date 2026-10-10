import { FORMAT_GUIDANCE_TTL_MS, sealApprovedIdea, type SealedApproval } from "./persona-brain.ts";

// A bounded, human-editorial FREE_ONLY starter — NOT a newly detected viral trend.
// References were independently checked on 2026-10-08 (UTC). Never roll the date
// forward automatically. Once evidence expires, the starter fails closed.
export const FREE_EDITORIAL_ID = "free-editorial-three-characters-20261009";
export const FREE_EDITORIAL_AS_OF = "2026-10-08";
export const FREE_EDITORIAL_TITLE = "Одна фраза — три совершенно разных персонажа";
// This starter cites official, evergreen filming FORMAT advice, not live
// popularity signals. Keep the 2026-10-08 review date unchanged and fail closed
// after 180 days; market/trend evidence elsewhere still expires in seven days.
const MAX_EVIDENCE_AGE_MS = FORMAT_GUIDANCE_TTL_MS;

export function freeEditorialCandidate(now = Date.now()): Record<string, unknown> | null {
  const asOf = Date.parse(FREE_EDITORIAL_AS_OF + "T00:00:00Z");
  if (!Number.isFinite(now) || now < asOf || now - asOf > MAX_EVIDENCE_AGE_MS) return null;
  return {
    id: FREE_EDITORIAL_ID,
    title: FREE_EDITORIAL_TITLE,
    angle: "Короткий актёрский эксперимент: одна и та же реплика меняет смысл благодаря характеру и интонации.",
    format: "reel",
    score: 83,
    confidence: 70,
    reason: "Бесплатная редакционно подготовленная идея. Основание — официальные рекомендации по формату Reels/Shorts; свежий рыночный тренд и прогноз охватов НЕ заявляются.",
    hook: "Одна и та же фраза. Три совершенно разных человека. Угадаешь, кто из них врёт?",
    script: "«Я тебя ждал». Первый говорит это с радостью, будто встретил старого друга. Второй — холодно, словно давно всё спланировал. А третий почти шепчет: он боялся, что этой встречи уже не будет. Слова не менялись. А история?",
    soloPlan: "Поставь iPhone вертикально на устойчивую опору на уровне глаз. Сними один дубль, меняя взгляд и интонацию после каждой короткой паузы.",
    helperPlan: "Помощник контролирует фокус и уровень голоса, камера остаётся неподвижной.",
    estimatedMinutes: 9,
    estimatedDurationSeconds: 25,
    whyNow: [
      "Актёрская демонстрация в одном кадре, без расходов и помощника.",
      "Основание — проверенные требования вертикального short-form; это НЕ подтверждение нового тренда."
    ],
    marketEvidence: [
      {
        source: "Meta for Business: Reels creative essentials (official format advice)",
        finding: "Meta рекомендует вертикальный Reels с качественным звуком и размещением важных элементов в безопасной зоне; здесь не утверждается текущий тренд.",
        url: "https://www.facebook.com/business/ads/facebook-instagram-reels-ads",
        asOf: FREE_EDITORIAL_AS_OF
      },
      {
        source: "YouTube Creator Blog: guide to YouTube Shorts (published 2025-04-08)",
        finding: "Официальное руководство YouTube советует вертикальный формат 9:16, захват внимания в первые секунды и съёмку на смартфон.",
        url: "https://blog.youtube/creator-and-artist-stories/your-guide-to-getting-started-with-youtube-shorts/",
        asOf: FREE_EDITORIAL_AS_OF
      }
    ],
    evidenceKind: "EDITORIAL_PLATFORM_GUIDANCE_NOT_LIVE_TREND",
    reviewProvenance: "HUMAN_EDITORIAL_CURATED_2026-10-08;NO_PAID_AI",
    qualityVerdict: {
      verdict: "APPROVE",
      score: 83,
      summary: "Редакционно проверенный короткий актёрский формат. Одобрено как выполнимое съёмочное задание, НЕ как прогноз популярности или разрешение на автопубликацию.",
      risks: [
        "Нет актуальных российских трендовых метрик — не заявлять рыночную новизну.",
        "Если произнести текст медленно, сократить третью часть для 25 секунд."
      ]
    }
  };
}

export async function signFreeEditorialStarter(
  signingSecret: string,
  history: unknown,
  now = Date.now(),
): Promise<SealedApproval | null> {
  const candidate = freeEditorialCandidate(now);
  if (!candidate) return null;
  const blocked = Array.isArray(history) && history.some(item =>
    item && typeof item === "object" &&
    ["used", "rejected", "later"].includes(String(item.status)) &&
    String(item.title || "").trim().toLocaleLowerCase("ru-RU") ===
      FREE_EDITORIAL_TITLE.toLocaleLowerCase("ru-RU"));
  if (blocked) return null;
  return sealApprovedIdea(candidate, signingSecret, now);
}
