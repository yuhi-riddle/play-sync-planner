import { describe, expect, it, vi } from "vitest";

import { runSecurityProbe } from "../../scripts/security/verify-function-privileges.mjs";

/** protectedCalls() の本数。増やしたらここも直す。 */
const PROTECTED_CALL_COUNT = 13;

const userAId = "11111111-1111-4111-8111-111111111111";
const userBId = "22222222-2222-4222-8222-222222222222";
const eventAId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const eventBId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function jwtFor(sub: string) {
  return `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.signature`;
}

function baseEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    SECURITY_TEST_SUPABASE_URL: "https://security-test.example",
    SECURITY_TEST_ANON_KEY: "anon-key",
    SECURITY_TEST_MODE: "anon-only",
    ...overrides
  };
}

function response(status: number, payload: unknown = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  } as Response;
}

describe("database privilege verification script", () => {
  it("fails closed when required configuration is missing", async () => {
    const fetchImpl = vi.fn();
    const write = vi.fn();
    const exitCode = await runSecurityProbe({
      env: baseEnv({ SECURITY_TEST_SUPABASE_URL: undefined }),
      fetchImpl,
      write
    });

    expect(exitCode).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(expect.stringContaining("configuration"));
  });

  it("refuses a production URL unless explicitly allowed", async () => {
    const fetchImpl = vi.fn();

    const exitCode = await runSecurityProbe({
      env: baseEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://security-test.example" }),
      fetchImpl,
      write: vi.fn()
    });

    expect(exitCode).toBe(1);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("allows a production URL when the opt-in flag is set", async () => {
    // 本番しか持っていない環境でも、明示的に許可すれば確認できる必要がある
    const fetchImpl = vi.fn(async () => response(403));

    const exitCode = await runSecurityProbe({
      env: baseEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://security-test.example",
        ALLOW_PRODUCTION_SECURITY_PROBE: "true"
      }),
      fetchImpl,
      write: vi.fn()
    });

    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(PROTECTED_CALL_COUNT);
  });

  it("requires every protected RPC to reject anonymous requests", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      void url;
      void init;
      return response(403);
    });
    const write = vi.fn();

    const exitCode = await runSecurityProbe({
      env: baseEnv(),
      fetchImpl,
      write
    });

    expect(write).toHaveBeenCalledWith("Security verification passed.");
    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(PROTECTED_CALL_COUNT);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toMatch(/\/rest\/v1\/rpc\//);
      expect(init.headers).toMatchObject({ apikey: "anon-key" });
      expect(new Headers(init.headers).has("authorization")).toBe(false);
    }
  });

  it("covers the participant helpers added by migration 030", async () => {
    // 共有ページの読み取りはこの6本を通る。抜けると匿名で開けるようになる
    const called: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      called.push(url.split("/rpc/")[1]);
      return response(403);
    });

    await runSecurityProbe({ env: baseEnv(), fetchImpl, write: vi.fn() });

    expect(called).toEqual(
      expect.arrayContaining([
        "is_plan_participant",
        "is_participant_of_event",
        "is_own_participant",
        "is_participant_in_my_plan",
        "is_settlement_payer",
        "is_settlement_in_my_plan"
      ])
    );
  });

  it("never probes a function that changes data", async () => {
    // 権限が緩んでいたら本当にブロックや清算開始が走ってしまう
    const called: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      called.push(url.split("/rpc/")[1]);
      return response(403);
    });

    await runSecurityProbe({ env: baseEnv(), fetchImpl, write: vi.fn() });

    expect(called).not.toContain("block_user_atomic");
    expect(called).not.toContain("mark_plan_settling");
  });

  it("sends the p_query argument list that migration 029 expects", async () => {
    // 旧5引数のまま呼ぶと関数が見つからず、拒否と区別がつかない失敗になる
    let listArgs: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/list_owned_event_ids")) {
        listArgs = JSON.parse(String(init.body));
      }
      return response(403);
    });

    await runSecurityProbe({ env: baseEnv(), fetchImpl, write: vi.fn() });

    expect(listArgs).toHaveProperty("p_query");
  });

  it("reports every leaking function, not just the first", async () => {
    // 1本目で止めると、何本開いているのか分からず直す範囲が決まらない
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith("/is_event_owner") || url.endsWith("/is_following") ? response(200, false) : response(403)
    );
    const write = vi.fn();

    const exitCode = await runSecurityProbe({ env: baseEnv(), fetchImpl, write });

    expect(exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("is_event_owner"));
    expect(write).toHaveBeenCalledWith(expect.stringContaining("is_following"));
  });

  it("checks each authenticated user against their own and counterpart event data", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const token = (init.headers as Record<string, string>).authorization;
      if (!token) {
        return response(403);
      }
      const userId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
      const ownEventId = userId === userAId ? eventAId : eventBId;
      const counterpartUserId = userId === userAId ? userBId : userAId;

      if (url.endsWith("/list_owned_event_ids")) {
        return response(200, [{ event_ids: [ownEventId], total_count: 1 }]);
      }

      if (url.endsWith("/is_event_owner") || url.endsWith("/is_joined_event_member")) {
        return body.target_event_id === ownEventId ? response(200, true) : response(403);
      }

      if (url.endsWith("/have_shared_event") || url.endsWith("/is_user_blocked")) {
        return body.first_user_id === userId && body.second_user_id === counterpartUserId
          ? response(200, false)
          : response(500);
      }

      if (url.endsWith("/is_following")) {
        return body.follower_id === userId && body.followed_id === counterpartUserId
          ? response(200, false)
          : response(500);
      }

      throw new Error("unexpected RPC");
    });

    const write = vi.fn();
    const exitCode = await runSecurityProbe({
      env: baseEnv({
        SECURITY_TEST_MODE: "full",
        SECURITY_TEST_USER_A_JWT: jwtFor(userAId),
        SECURITY_TEST_USER_B_JWT: jwtFor(userBId),
        SECURITY_TEST_USER_A_EVENT_ID: eventAId,
        SECURITY_TEST_USER_B_EVENT_ID: eventBId
      }),
      fetchImpl,
      write
    });

    expect(write).toHaveBeenCalledWith("Security verification passed.");
    expect(exitCode).toBe(0);
    // 匿名13本 + 利用者2人 × 8本
    expect(fetchImpl).toHaveBeenCalledTimes(PROTECTED_CALL_COUNT + 16);
  });

  it("rejects a full-mode relationship RPC response of true", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const token = (init.headers as Record<string, string>).authorization;
      if (!token) return response(403);

      const userId = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
      const ownEventId = userId === userAId ? eventAId : eventBId;

      if (url.endsWith("/list_owned_event_ids")) return response(200, [{ event_ids: [ownEventId], total_count: 1 }]);
      if (url.endsWith("/is_event_owner") || url.endsWith("/is_joined_event_member")) {
        return body.target_event_id === ownEventId ? response(200, true) : response(403);
      }
      if (url.endsWith("/have_shared_event")) return response(200, true);
      return response(200, false);
    });

    const exitCode = await runSecurityProbe({
      env: baseEnv({
        SECURITY_TEST_MODE: "full",
        SECURITY_TEST_USER_A_JWT: jwtFor(userAId),
        SECURITY_TEST_USER_B_JWT: jwtFor(userBId),
        SECURITY_TEST_USER_A_EVENT_ID: eventAId,
        SECURITY_TEST_USER_B_EVENT_ID: eventBId
      }),
      fetchImpl,
      write: vi.fn()
    });

    expect(exitCode).toBe(1);
  });

  it("aborts a hanging request when its timeout elapses", async () => {
    let signal: AbortSignal | undefined;
    const setTimeoutImpl = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
    const clearTimeoutImpl = vi.fn();
    const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      signal = init.signal ?? undefined;
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));

    const exitCode = await runSecurityProbe({
      env: baseEnv(),
      fetchImpl,
      write: vi.fn(),
      timeoutMs: 1,
      setTimeoutImpl,
      clearTimeoutImpl
    });

    expect(exitCode).toBe(1);
    expect(signal?.aborted).toBe(true);
    expect(clearTimeoutImpl).toHaveBeenCalledWith(1);
  }, 200);
});
