// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookies } = vi.hoisted(() => ({ cookies: vi.fn() }));
const { createSupabaseServerClient, createSupabaseAdminClient } = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient, createSupabaseAdminClient }));

import { GET } from "@/app/auth/callback/route";
import { PENDING_CONSENT_COOKIE, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

const userId = "33333333-3333-4333-8333-333333333333";

function cookieStoreWith(pendingConsent: string | undefined) {
  return {
    get: vi.fn((name: string) =>
      name === PENDING_CONSENT_COOKIE && pendingConsent ? { value: pendingConsent } : undefined
    ),
    delete: vi.fn()
  };
}

function serverClientMock() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: { onboarding_completed_at: "2026-07-01T00:00:00.000Z" },
    error: null
  });
  const from = vi.fn((table: string) => {
    if (table === "user_consents") return { upsert };
    if (table === "profiles") return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: {
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } } })
      },
      from
    },
    upsert
  };
}

describe("auth callback: 同意記録", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("同意を記録したらapp_metadataにも印を書く", async () => {
    cookies.mockResolvedValue(cookieStoreWith(`${TERMS_VERSION}:${PRIVACY_VERSION}`));
    const { client, upsert } = serverClientMock();
    createSupabaseServerClient.mockResolvedValue(client);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    const response = await GET(new NextRequest("https://example.com/auth/callback?code=abc"));

    expect(upsert).toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        app_metadata: expect.objectContaining({ legal_consent_accepted_at: expect.any(String) })
      })
    );
    expect(response.status).toBe(307);
  });

  it("同意クッキーが無ければ印を書かず /consent へ送る", async () => {
    cookies.mockResolvedValue(cookieStoreWith(undefined));
    const { client } = serverClientMock();
    createSupabaseServerClient.mockResolvedValue(client);
    const updateUserById = vi.fn().mockResolvedValue({ error: null });
    createSupabaseAdminClient.mockReturnValue({ auth: { admin: { updateUserById } } });

    const response = await GET(new NextRequest("https://example.com/auth/callback?code=abc"));

    expect(updateUserById).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/consent");
  });
});
