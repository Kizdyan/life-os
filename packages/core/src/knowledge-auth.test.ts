import { describe, expect, it } from "vitest";
import { SupabaseKnowledgeAuthenticator } from "./knowledge-authority";

describe("server-verified knowledge identity", () => {
  it("derives the owner boundary from verified Supabase auth.uid", async () => {
    let request: { url: string; authorization: string | null } | undefined;
    const auth = new SupabaseKnowledgeAuthenticator({
      supabaseUrl: "https://project.supabase.co",
      publishableKey: "publishable-key",
      allowedScopes: [{ agent: "erika", purpose: "personal_assistance" }],
      fetchImpl: async (url, init) => {
        const headers = new Headers(init?.headers);
        request = { url: String(url), authorization: headers.get("Authorization") };
        return new Response(JSON.stringify({ id: "verified-user", app_metadata: { untrusted_tenant_id: "forged-tenant" } }), { status: 200 });
      },
    });
    const principal = await auth.authenticate({ accessToken: "private-access-token", agent: "erika", purpose: "personal_assistance" });
    expect(principal).toMatchObject({ userId: "verified-user", tenantId: "verified-user", roles: ["authenticated"] });
    expect(request).toEqual({ url: "https://project.supabase.co/auth/v1/user", authorization: "Bearer private-access-token" });
  });

  it("rejects a caller-selected agent scope absent from verified claims", async () => {
    const auth = new SupabaseKnowledgeAuthenticator({ supabaseUrl: "https://project.supabase.co", publishableKey: "publishable-key", allowedScopes: [{ agent: "persona_public", purpose: "public_content" }], fetchImpl: async () => new Response(JSON.stringify({ id: "user", app_metadata: { tenant_id: "tenant", knowledge_scopes: ["persona_public:public_content"] } }), { status: 200 }) });
    await expect(auth.authenticate({ accessToken: "token", agent: "erika", purpose: "personal_assistance" })).rejects.toThrow(/scope denied/i);
  });

  it("rejects an invalid bearer credential", async () => {
    const auth = new SupabaseKnowledgeAuthenticator({ supabaseUrl: "https://project.supabase.co", publishableKey: "publishable-key", allowedScopes: [{ agent: "persona_public", purpose: "public_content" }], fetchImpl: async () => new Response("unauthorized", { status: 401 }) });
    await expect(auth.authenticate({ accessToken: "bad-token", agent: "erika", purpose: "personal_assistance" })).rejects.toThrow(/authentication failed/i);
  });
});
