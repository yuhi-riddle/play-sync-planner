// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { middleware } from "@/middleware";

const userId = "22222222-2222-4222-8222-222222222222";

type TableResult = { data: unknown; error: unknown };

function builderFor(result: TableResult) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

function supabaseClientForUser(
  user: Record<string, unknown>,
  options: { consent?: TableResult; profile?: TableResult } = {}
) {
  const consentResult = options.consent ?? { data: { user_id: userId }, error: null };
  const profileResult = options.profile ?? { data: { onboarding_completed_at: "2026-07-01T00:00:00.000Z" }, error: null };
  const from = vi.fn((table: string) => {
    if (table === "user_consents") return builderFor(consentResult);
    if (table === "profiles") return builderFor(profileResult);
    throw new Error(`unexpected table: ${table}`);
  });

  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user } })), signOut: vi.fn().mockResolvedValue({ error: null }) },
      from
    },
    from
  };
}

describe("middleware: 同意ゲートとオンボーディング導線の並列化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("同意レコードが無ければ /consent へリダイレクトする", async () => {
    const { client } = supabaseClientForUser({ id: userId, user_metadata: {} }, { consent: { data: null, error: null } });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/consent?next=");
  });

  it("同意ありでオンボーディング未完了なら /onboarding/profile へリダイレクトする", async () => {
    const { client } = supabaseClientForUser(
      { id: userId, user_metadata: {} },
      { profile: { data: { onboarding_completed_at: null }, error: null } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding/profile");
  });

  it("user_metadataにprofile_onboarding_completed_atがあればリダイレクトせず通過し、profilesを引かない", async () => {
    const { client, from } = supabaseClientForUser({
      id: userId,
      user_metadata: { profile_onboarding_completed_at: "2026-07-01T00:00:00.000Z" }
    });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.headers.get("location")).toBeNull();
    expect(from).not.toHaveBeenCalledWith("profiles");
    expect(from).toHaveBeenCalledWith("user_consents");
  });

  it("/onboarding/profileへのアクセスは通過し、profilesを引かない", async () => {
    const { client, from } = supabaseClientForUser({ id: userId, user_metadata: {} });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/onboarding/profile"));

    expect(response.headers.get("location")).toBeNull();
    expect(from).not.toHaveBeenCalledWith("profiles");
  });

  it("app_metadataに同意印があればuser_consentsを引かずに通過する", async () => {
    const { client, from } = supabaseClientForUser({
      id: userId,
      user_metadata: { profile_onboarding_completed_at: "2026-07-01T00:00:00.000Z" },
      app_metadata: { legal_consent_accepted_at: "2026-07-10T00:00:00.000Z" }
    });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.headers.get("location")).toBeNull();
    expect(from).not.toHaveBeenCalledWith("user_consents");
  });

  it("app_metadataに印が無ければ従来通りuser_consentsを引いてゲートする", async () => {
    const { client, from } = supabaseClientForUser(
      { id: userId, user_metadata: {}, app_metadata: {} },
      { consent: { data: null, error: null } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(from).toHaveBeenCalledWith("user_consents");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/consent?next=");
  });

  // user_metadataは本人がauth.updateUser()で書き換えられるため、そこに同意印を偽装しても
  // ゲートを通れてはならない。信頼できるのはapp_metadataだけ、という branch の核心を固定する回帰テスト。
  it("user_metadataに同意印を偽装してもuser_consentsを引いてゲートする(app_metadataだけが正規の印)", async () => {
    const { client, from } = supabaseClientForUser(
      {
        id: userId,
        user_metadata: { legal_consent_accepted_at: "2026-07-10T00:00:00.000Z" },
        app_metadata: {}
      },
      { consent: { data: null, error: null } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(from).toHaveBeenCalledWith("user_consents");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/consent?next=");
  });

  it("app_metadataに同意印があってもオンボーディング未完了ならprofilesは引くがuser_consentsは引かない", async () => {
    const { client, from } = supabaseClientForUser(
      {
        id: userId,
        user_metadata: {},
        app_metadata: { legal_consent_accepted_at: "2026-07-10T00:00:00.000Z" }
      },
      { profile: { data: { onboarding_completed_at: null }, error: null } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(from).not.toHaveBeenCalledWith("user_consents");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/onboarding/profile");
  });

  it("同意チェックがDBエラーなら fail closed で /consent へ送る", async () => {
    const { client } = supabaseClientForUser(
      { id: userId, user_metadata: {} },
      { consent: { data: null, error: { message: "db down" } } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/consent?next=");
  });

  it("オンボーディングチェックがDBエラーでも fail open で通過する", async () => {
    const { client } = supabaseClientForUser(
      { id: userId, user_metadata: {} },
      { profile: { data: null, error: { message: "db down" } } }
    );
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(response.headers.get("location")).toBeNull();
  });
});
