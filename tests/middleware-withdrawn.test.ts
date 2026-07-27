// @vitest-environment node
// NextRequest/NextResponse は undici の Headers を要求するので、jsdom ではなく node で動かす。
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createServerClient } = vi.hoisted(() => ({ createServerClient: vi.fn() }));

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { middleware } from "@/middleware";

const userId = "11111111-1111-4111-8111-111111111111";

function supabaseClientForUser(user: Record<string, unknown> | null) {
  const signOut = vi.fn().mockResolvedValue({ error: null });
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data: { user_id: userId }, error: null }));

  return {
    client: {
      auth: { getUser: vi.fn(async () => ({ data: { user } })), signOut },
      from: vi.fn(() => builder)
    },
    signOut
  };
}

describe("middleware: 退会済みユーザー", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("退会済みならサインアウトしてログイン画面へ送る", async () => {
    const { client, signOut } = supabaseClientForUser({
      id: userId,
      user_metadata: { withdrawn_at: "2026-07-27T00:00:00.000Z" }
    });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(signOut).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(response.headers.get("location")).toContain("withdrawn=1");
  });

  it("ログイン画面自体はリダイレクトの対象にしない", async () => {
    const { client } = supabaseClientForUser({
      id: userId,
      user_metadata: { withdrawn_at: "2026-07-27T00:00:00.000Z" }
    });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/login"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("退会していないユーザーはそのまま通す", async () => {
    const { client, signOut } = supabaseClientForUser({
      id: userId,
      user_metadata: { profile_onboarding_completed_at: "2026-07-01T00:00:00.000Z" }
    });
    createServerClient.mockReturnValue(client);

    const response = await middleware(new NextRequest("https://example.com/events"));

    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBeNull();
  });
});
