import {
  diagnoseVerifiedMeasurements,
  type VerifiedDiagnosticResult,
} from "../../../packages/core/src/divem-strategy-client";

export type DiveMInput = Record<string, string>;

export const metricLabels: Record<string, string> = {
  profile_clarity: "Ясность профиля",
  content_consistency: "Последовательность контента",
  audience_response: "Отклик аудитории",
};

export type DiveMView =
  | { kind: "empty"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "result"; result: VerifiedDiagnosticResult };

export function presentDiagnostic(input: DiveMInput): DiveMView {
  const measurements: Record<string, number> = {};
  for (const [name, raw] of Object.entries(input)) {
    const value = raw.trim();
    if (!value) continue;
    const number = Number(value.replace(",", "."));
    if (!Number.isFinite(number) || number < 0 || number > 1) {
      return { kind: "invalid", message: "Каждый показатель должен быть числом от 0 до 1." };
    }
    measurements[name] = number;
  }

  if (!Object.keys(measurements).length) {
    return { kind: "empty", message: "Добавьте минимум два проверенных показателя." };
  }

  try {
    return {
      kind: "result",
      result: diagnoseVerifiedMeasurements({
        tenantId: "local-owner",
        authorizedTenantId: "local-owner",
        measurements,
      }),
    };
  } catch {
    return { kind: "invalid", message: "Не удалось проверить введённые показатели." };
  }
}
