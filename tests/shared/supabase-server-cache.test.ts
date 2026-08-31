import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesMock, createServerClientMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  createServerClientMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock
}));

// React.cache() によるリクエスト内メモ化は、Next.jsの実際のServer Component
// レンダリング文脈(内部のAsyncLocalStorageベースのキャッシュディスパッチャ)に依存する。
// vitest(jsdom)単体ではこのディスパッチャが無いため呼び出しは毎回素通りする
// (node -e で cache() 単体の挙動を確認済み)。ここでは cache() でラップしても
// 挙動が壊れていないことだけを確認する。
describe("lib/supabase/server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    cookiesMock.mockResolvedValue({ getAll: () => [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("createSupabaseServerClientはSupabaseクライアントを返す", async () => {
    const client = { auth: { getUser: vi.fn() } };
    createServerClientMock.mockReturnValue(client);

    const { createSupabaseServerClient } = await import("@/lib/supabase/server");

    await expect(createSupabaseServerClient()).resolves.toBe(client);
  });

  it("getCurrentUserはSupabaseから取得したユーザーを返す", async () => {
    const user = { id: "user-1" };
    createServerClientMock.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } });

    const { getCurrentUser } = await import("@/lib/supabase/server");

    await expect(getCurrentUser()).resolves.toBe(user);
  });

  it("getCurrentUserIdはユーザーIDだけを返す", async () => {
    createServerClientMock.mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) }
    });

    const { getCurrentUserId } = await import("@/lib/supabase/server");

    await expect(getCurrentUserId()).resolves.toBe("user-1");
  });

  it("getCurrentUserIdは未ログインの場合nullを返す", async () => {
    createServerClientMock.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });

    const { getCurrentUserId } = await import("@/lib/supabase/server");

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it("getCurrentActiveUserはapp_metadataに退会印がある場合nullを返す", async () => {
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", app_metadata: { withdrawn_at: "2026-08-30T00:00:00.000Z" } } }
        })
      }
    });

    const { getCurrentActiveUser } = await import("@/lib/supabase/server");

    await expect(getCurrentActiveUser()).resolves.toBeNull();
  });

  it("getCurrentActiveUserは退会印がないユーザーを返す", async () => {
    const user = { id: "user-1", app_metadata: {} };
    createServerClientMock.mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } });

    const { getCurrentActiveUser } = await import("@/lib/supabase/server");

    await expect(getCurrentActiveUser()).resolves.toBe(user);
  });

  it("getCurrentActiveUserIdは退会済みの場合nullを返す", async () => {
    createServerClientMock.mockReturnValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-1", app_metadata: { withdrawn_at: "2026-08-30T00:00:00.000Z" } } }
        })
      }
    });

    const { getCurrentActiveUserId } = await import("@/lib/supabase/server");

    await expect(getCurrentActiveUserId()).resolves.toBeNull();
  });
});
