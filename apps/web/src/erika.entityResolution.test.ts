import { beforeEach, describe, expect, it, vi } from "vitest";

const { move, outcome } = vi.hoisted(() => ({ move: vi.fn(), outcome: vi.fn() }));
vi.mock("./api", () => ({ move, outcome }));
import { executeErika } from "./erika";

const task = (id: string, title: string) => ({
  id, title, kind: "task", status: "planned" as const,
  planned_start: "2026-10-19T10:00:00+03:00", planned_end: null, carry_forward: false,
});
const date = "2026-10-20T14:30:00+03:00";

describe("Erika task entity resolution for explicit moves", () => {
  beforeEach(() => { move.mockReset(); outcome.mockReset(); move.mockResolvedValue({}); });

  it.each([
    ["Перенеси репетицию на 2026-10-20 в 14:30", "Репетиция"],
    ["Пожалуйста, перенеси генеральную репетицию на 2026-10-20 в 14:30", "Генеральная репетиция"],
    ["Перенеси генеральной репетиции на 2026-10-20 в 14:30", "Генеральная репетиция"],
  ])("resolves a unique full Russian title form: %s", async (text, title) => {
    await expect(executeErika(text, [task("one", title)])).resolves.toMatchObject({ understood: true });
    expect(move).toHaveBeenCalledWith("one", date);
  });

  it("does not write when a shorter phrase has several credible full-title candidates", async () => {
    const result = await executeErika("Перенеси репетицию на 2026-10-20 в 14:30", [
      task("one", "Репетиция"), task("two", "Репетиция вокала"),
    ]);
    expect(result).toEqual({ understood: false, message: "Уточните, какую задачу перенести: Репетиция или Репетиция вокала." });
    expect(move).not.toHaveBeenCalled();
  });

  it("does not write when there is no full-title match or date is invalid", async () => {
    await expect(executeErika("Перенеси встречу на 2026-10-20 в 14:30", [task("one", "Репетиция")]))
      .resolves.toMatchObject({ understood: false, message: "Не нашла задачу для переноса." });
    await expect(executeErika("Перенеси репетицию на 2026-02-30 в 14:30", [task("one", "Репетиция")]))
      .resolves.toMatchObject({ understood: false, message: "Дата или время переноса некорректны." });
    expect(move).not.toHaveBeenCalled();
  });
});
