import { describe, expect, it } from "vitest";
import { SupabaseLifeItemRepository } from "./supabase-repository";
import { previewHarveyProspectsCsv } from "./harvey-prospect-review";

const CSV = [
  "email,first_name,last_name,company_name,website,status,score",
  "someone@example.com,A,B,Example Studio,https://studio.example.com,new,84",
].join("\n");

const config = {
  url: "https://supabase.example.com",
  publishableKey: "test-public-key",
  accessToken: "test-owner-access-token",
};

describe("Harvey review import via existing Supabase life_items", () => {
  it("POSTs only native review tasks with conflict-ignore and RLS bearer", async () => {
    const { reviewTasks } = previewHarveyProspectsCsv(CSV, {
      projectId: "sales-opportunities",
      now: "2026-10-26T10:00:00.000Z",
    });
    const received: Array<{ url: string; init?: RequestInit }> = [];
    const mockedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      received.push({ url: String(input), init });
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const repo = new SupabaseLifeItemRepository(config);
    await repo.enqueueHarveyReviewTasks(reviewTasks, mockedFetch);

    expect(received).toHaveLength(1);
    expect(received[0].url).toBe(
      "https://supabase.example.com/rest/v1/life_items?on_conflict=id",
    );
    expect(received[0].init?.method).toBe("POST");
    const headers = received[0].init?.headers as Record<string, string>;
    expect(headers.Prefer).toBe("resolution=ignore-duplicates,return=minimal");
    expect(headers.Authorization).toBe("Bearer test-owner-access-token");
    const payload = JSON.parse(String(received[0].init?.body));
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      id: "harvey:lead-review:studio.example.com",
      kind: "task",
      status: "planned",
      project_id: "sales-opportunities",
    });
    expect(JSON.stringify(payload)).not.toContain("someone@example.com");
    expect(JSON.stringify(payload)).not.toContain("test-owner-access-token");
  });

  it("sends no request for an empty review batch", async () => {
    let calls = 0;
    const transport = (async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    await new SupabaseLifeItemRepository(config)
      .enqueueHarveyReviewTasks([], transport);
    expect(calls).toBe(0);
  });

  it("blocks arbitrary content and non-review tasks before network", async () => {
    let calls = 0;
    const transport = (async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const { reviewTasks } = previewHarveyProspectsCsv(CSV, {
      projectId: "sales-opportunities",
      now: "2026-10-26T10:00:00.000Z",
    });
    await expect(new SupabaseLifeItemRepository(config)
      .enqueueHarveyReviewTasks([
        { ...reviewTasks[0], id: "unrelated-task", status: "completed" },
      ], transport)).rejects.toThrow("Only bounded");
    expect(calls).toBe(0);
  });

  it("does not report persisted tasks if Supabase rejects the write", async () => {
    const { reviewTasks } = previewHarveyProspectsCsv(CSV, {
      projectId: "sales-opportunities",
      now: "2026-10-26T10:00:00.000Z",
    });
    const transport = (async () => new Response(null, { status: 403 })) as typeof fetch;
    await expect(new SupabaseLifeItemRepository(config)
      .enqueueHarveyReviewTasks(reviewTasks, transport))
      .rejects.toThrow("403");
  });
});
