import { describe, expect, it, vi } from "vitest";

import { runSecurityProbe } from "../scripts/security/verify-function-privileges.mjs";

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

  it("requires every protected RPC to reject anonymous requests", async () => {
    const fetchImpl = vi.fn(async () => response(403));
    const write = vi.fn();

    const exitCode = await runSecurityProbe({
      env: baseEnv(),
      fetchImpl,
      write
    });

    expect(write).toHaveBeenCalledWith("Security verification passed.");
    expect(exitCode).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toMatch(/\/rest\/v1\/rpc\//);
      expect(init.headers).toMatchObject({ apikey: "anon-key" });
      expect(init.headers.authorization).toBeUndefined();
    }
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
      const counterpartEventId = userId === userAId ? eventBId : eventAId;
      const counterpartUserId = userId === userAId ? userBId : userAId;

      if (url.endsWith("/list_owned_event_ids")) {
        return response(200, [{ event_ids: [ownEventId], total_count: 1 }]);
      }

      if (url.endsWith("/is_event_owner") || url.endsWith("/is_joined_event_member")) {
        return body.target_event_id === ownEventId
          ? response(200, true)
          : response(403);
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
    expect(fetchImpl).toHaveBeenCalledTimes(22);
  });
});
