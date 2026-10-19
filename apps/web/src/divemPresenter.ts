import {
  diagnoseVerifiedMeasurements,
  type VerifiedDiagnosticResult,
} from "../../../packages/core/src/divem-strategy-client";

export type DiveMInput = Record<string, string>;
export type EvidenceState = "VERIFIED" | "UNVERIFIED";

export const metricLabels: Record<string, string> = {
  profile_clarity: "Ясность профиля",
  content_consistency: "Последовательность контента",
  audience_response: "Отклик аудитории",
};

export type DiveMView =
  | { kind: "empty"; message: string; unverified: string[] }
  | { kind: "invalid"; message: string }
  | { kind: "result"; result: VerifiedDiagnosticResult; unverified: string[] };

export function presentDiagnostic(input: DiveMInput, evidence: Record<string, EvidenceState> = {}): DiveMView {
  const measurements: Record<string, number> = {};
  const unverified: string[] = [];

  for (const [name, raw] of Object.entries(input)) {
    const value = raw.trim();
    if (!value) continue;
    const number = Number(value.replace(",", "."));
    if (!Number.isFinite(number) || number < 0 || number > 1) {
      return { kind: "invalid", message: "Каждый показатель должен быть числом от 0 до 1." };
    }
    if ((evidence[name] ?? "VERIFIED") === "UNVERIFIED") {
      unverified.push(name);
      continue;
    }
    measurements[name] = number;
  }

  if (!Object.keys(measurements).length) {
    return {
      kind: "empty",
      message: unverified.length ? "Подтвердите источник минимум двух показателей перед расчётом." : "Добавьте минимум два проверенных показателя.",
      unverified,
    };
  }

  try {
    return {
      kind: "result",
      result: diagnoseVerifiedMeasurements({
        tenantId: "local-owner",
        authorizedTenantId: "local-owner",
        measurements,
      }),
      unverified,
    };
  } catch {
    return { kind: "invalid", message: "Не удалось проверить введённые показатели." };
  }
}
