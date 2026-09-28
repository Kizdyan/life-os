import { describe, expect, it } from "vitest";
import { buildMediaBrainDigest } from "./media-digest";
import type { MediaJob } from "./media-jobs";
import type { MediaProjectProjection } from "./media-project-lifecycle";

const projects: MediaProjectProjection[] = [
  {
    projectId: "active",
    state: "active",
    visibleInActiveProjects: true,
    assetCount: 2,
    terminalAssetCount: 0,
  },
  {
    projectId: "review",
    state: "ready_for_review",
    visibleInActiveProjects: true,
    assetCount: 1,
    terminalAssetCount: 0,
  },
  {
    projectId: "published",
    state: "published",
    visibleInActiveProjects: false,
    assetCount: 1,
    terminalAssetCount: 1,
  },
];

function job(id: string, state: MediaJob["state"]): MediaJob {
  return {
    id,
    type: "analyze",
    assetId: "asset-1",
    projectId: "active",
    state,
    dependsOnJobId: null,
    attempts: 0,
    maxAttempts: 4,
    notBefore: null,
    lastError: null,
    createdAt: "2026-09-29T10:00:00.000Z",
    updatedAt: "2026-09-29T10:00:00.000Z",
  };
}

describe("Erika Media Brain digest", () => {
  it("surfaces only useful review/exception information", () => {
    const digest = buildMediaBrainDigest({
      connection: { connected: true, provider: "yandex" },
      projects,
      jobs: [job("failed", "failed")],
    });

    expect(digest.summary).toContain("в работе: 1");
    expect(digest.summary).toContain("на проверке: 1");
    expect(digest.attention).toContain("1 материал ждёт проверки.");
    expect(digest.attention.some((item) => item.includes("будут повторены автоматически"))).toBe(true);
    expect(digest.systemHealthy).toBe(true);
  });

  it("marks disconnected storage and exhausted jobs as real exceptions", () => {
    const digest = buildMediaBrainDigest({
      connection: { connected: false, provider: "yandex" },
      projects: [],
      jobs: [job("dead", "dead_letter")],
    });

    expect(digest.systemHealthy).toBe(false);
    expect(digest.attention).toContain("Подключить Яндекс Диск.");
    expect(digest.attention.some((item) => item.includes("остановлены"))).toBe(true);
  });
});
