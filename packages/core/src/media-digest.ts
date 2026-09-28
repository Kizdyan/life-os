import type { MediaJob } from "./media-jobs";
import type { MediaProjectProjection } from "./media-project-lifecycle";
import type { YandexDiskConnectionStatus } from "./yandex-connection";

export interface MediaBrainDigest {
  systemHealthy: boolean;
  connection: "connected" | "disconnected";
  inProgressProjects: number;
  readyForReview: number;
  publishedProjects: number;
  failedJobs: number;
  deadLetterJobs: number;
  attention: string[];
  summary: string;
}

export function buildMediaBrainDigest(input: {
  connection: YandexDiskConnectionStatus;
  projects: MediaProjectProjection[];
  jobs: MediaJob[];
}): MediaBrainDigest {
  const readyForReview = input.projects.filter(
    (project) => project.state === "ready_for_review",
  ).length;
  const publishedProjects = input.projects.filter(
    (project) => project.state === "published",
  ).length;
  const inProgressProjects = input.projects.filter((project) =>
    ["active", "approved"].includes(project.state),
  ).length;
  const failedJobs = input.jobs.filter((job) => job.state === "failed").length;
  const deadLetterJobs = input.jobs.filter(
    (job) => job.state === "dead_letter",
  ).length;

  const attention: string[] = [];
  if (!input.connection.connected) {
    attention.push("Подключить Яндекс Диск.");
  }
  if (readyForReview > 0) {
    attention.push(
      readyForReview === 1
        ? "1 материал ждёт проверки."
        : `${readyForReview} материала ждут проверки.`,
    );
  }
  if (deadLetterJobs > 0) {
    attention.push(
      `${deadLetterJobs} задач остановлены после повторных ошибок.`,
    );
  } else if (failedJobs > 0) {
    attention.push(
      `${failedJobs} задач временно не выполнились и будут повторены автоматически.`,
    );
  }

  const systemHealthy =
    input.connection.connected && deadLetterJobs === 0;

  const parts = [
    `в работе: ${inProgressProjects}`,
    `на проверке: ${readyForReview}`,
    `опубликовано: ${publishedProjects}`,
  ];
  if (failedJobs > 0) parts.push(`повторяется после ошибок: ${failedJobs}`);
  if (deadLetterJobs > 0) parts.push(`требует вмешательства: ${deadLetterJobs}`);

  return {
    systemHealthy,
    connection: input.connection.connected ? "connected" : "disconnected",
    inProgressProjects,
    readyForReview,
    publishedProjects,
    failedJobs,
    deadLetterJobs,
    attention,
    summary: `Media Brain — ${parts.join(", ")}.`,
  };
}
