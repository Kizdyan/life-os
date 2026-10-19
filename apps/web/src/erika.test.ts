import { beforeEach, describe, expect, it, vi } from "vitest";

const { move, outcome } = vi.hoisted(() => ({ move: vi.fn(), outcome: vi.fn() }));

vi.mock("./api", () => ({ move, outcome }));

import { executeErika } from "./erika";

const rehearsal = {
  id: "task-1",
  title: "Репетиция",
  kind: "task",
  status: "planned",
  planned_start: "2026-10-19T10:00:00+03:00",
  planned_end: null,
  carry_forward: false,
};

describe("Erika explicit local move command", () => {
  beforeEach(() => { move.mockReset(); outcome.mockReset(); });

  it("moves one uniquely matched item and confirms the durable local action", async () => {
    move.mockResolvedValue({ item: { ...rehearsal, planned_start: "2026-10-20T14:30:00+03:00" } });

    await expect(executeErika("Перенеси репетицию на 2026-10-20 в 14:30", [rehearsal]))
      .resolves.toEqual({
        understood: true,
        message: "↗ Репетиция — перенесено на 2026-10-20 в 14:30.",
      });
    expect(move).toHaveBeenCalledWith("task-1", "2026-10-20T14:30:00+03:00");
  });

  it("refuses ambiguous or incomplete move commands without a write", async () => {
    await expect(executeErika("Перенеси репетицию", [rehearsal])).resolves.toMatchObject({ understood: false });
    await expect(executeErika("Перенеси репетицию на 2026-10-20 в 14:30", [rehearsal, { ...rehearsal, id: "task-2" }]))
      .resolves.toMatchObject({ understood: false });
    expect(move).not.toHaveBeenCalled();
  });
});
