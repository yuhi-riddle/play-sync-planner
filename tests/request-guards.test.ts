import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseServerClient,
  consumePublicAnswerRateLimit,
  consumePublicSettlementRateLimit,
  recordPublicAnswerRateLimitDenial,
  recordPublicSettlementRateLimitDenial
} = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
  consumePublicAnswerRateLimit: vi.fn(),
  consumePublicSettlementRateLimit: vi.fn(),
  recordPublicAnswerRateLimitDenial: vi.fn(),
  recordPublicSettlementRateLimitDenial: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));
vi.mock("@/lib/server/admin/public-answer", () => ({
  consumePublicAnswerRateLimit,
  recordPublicAnswerRateLimitDenial
}));
vi.mock("@/lib/server/admin/public-settlement", () => ({
  consumePublicSettlementRateLimit,
  recordPublicSettlementRateLimitDenial
}));

import {
  requireEventAccess,
  requireUser
} from "@/lib/server/request-guards";
import {
  RateLimitConfigurationError,
  RateLimitError,
  consumeAuthenticatedLimit,
  consumePublicLimit
} from "@/lib/server/rate-limit";
import { toRouteError } from "@/lib/server/route-errors";
import { safeLog } from "@/lib/server/safe-log";

const user = { id: "11111111-1111-4111-8111-111111111111" };
const eventId = "22222222-2222-4222-8222-222222222222";
const originalSecret = process.env.RATE_LIMIT_HMAC_SECRET;

function authClient(currentUser: { id: string } | null, authError: unknown = null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: currentUser },
        error: authError
      })
    }
  };
}

function query(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result)
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

describe("request guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an invalid event UUID before creating a database client", async () => {
    await expect(requireEventAccess("not-an-id", "owner")).rejects.toMatchObject({
      status: 400,
      code: "invalid_request"
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("returns the authenticated user and the same session client", async () => {
    const supabase = authClient(user);
    createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(requireUser()).resolves.toEqual({ user, supabase });
  });

  it("maps a missing session to a safe 401 guard error", async () => {
    createSupabaseServerClient.mockResolvedValue(authClient(null));

    await expect(requireUser()).rejects.toEqual(
      expect.objectContaining({
        status: 401,
        code: "authentication_required"
      })
    );
  });

  it("rejects the wrong explicit event role with 403", async () => {
    const eventQuery = query({
      data: { id: eventId, owner_user_id: "33333333-3333-4333-8333-333333333333" },
      error: null
    });
    const membershipQuery = query({ data: null, error: null });
    const supabase = {
      ...authClient(user),
      from: vi.fn((table: string) => table === "events" ? eventQuery : membershipQuery)
    };
    createSupabaseServerClient.mockResolvedValue(supabase);

    await expect(requireEventAccess(eventId, "owner-or-joined")).rejects.toMatchObject({
      status: 403,
      code: "event_access_denied"
    });
  });

  it("generalizes database errors without exposing their messages", async () => {
    const eventQuery = query({
      data: null,
      error: { message: "postgres secret body and token" }
    });
    const supabase = { ...authClient(user), from: vi.fn(() => eventQuery) };
    createSupabaseServerClient.mockResolvedValue(supabase);

    const error = await requireEventAccess(eventId, "owner").catch((caught) => caught);
    expect(error).toMatchObject({ status: 500, code: "access_check_failed" });
    expect(String(error)).not.toContain("postgres secret");
    expect(String(error)).not.toContain("token");
  });
});

describe("database-backed rate limits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RATE_LIMIT_HMAC_SECRET = "a-secure-rate-limit-secret-that-is-at-least-32-bytes";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.RATE_LIMIT_HMAC_SECRET;
    } else {
      process.env.RATE_LIMIT_HMAC_SECRET = originalSecret;
    }
  });

  it("maps the stable SQL overflow into RateLimitError", async () => {
    const rpc = vi.fn().mockResolvedValue({
      error: { code: "PSP02", details: "17", message: "do not expose" }
    });
    createSupabaseServerClient.mockResolvedValue({ ...authClient(user), rpc });

    const error = await consumeAuthenticatedLimit("event_update").catch((caught) => caught);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.retryAfterSeconds).toBe(17);
    expect(rpc).toHaveBeenCalledWith("consume_authenticated_rate_limit", {
      operation: "event_update"
    });
  });

  it("sends only an HMAC of the public token to the bounded admin wrapper", async () => {
    consumePublicAnswerRateLimit.mockResolvedValue({ error: null });
    const token = "raw-share-token-never-sent-to-rate-limit-rpc";
    const expected = createHmac("sha256", process.env.RATE_LIMIT_HMAC_SECRET!)
      .update("public_answer:" + token)
      .digest("hex");

    await consumePublicLimit("public_answer", token);

    expect(consumePublicAnswerRateLimit).toHaveBeenCalledWith(expected);
    expect(JSON.stringify(consumePublicAnswerRateLimit.mock.calls)).not.toContain(token);
    expect(consumePublicSettlementRateLimit).not.toHaveBeenCalled();
  });

  it("fails closed when the HMAC secret is missing or too short", async () => {
    process.env.RATE_LIMIT_HMAC_SECRET = "short";

    await expect(consumePublicLimit("public_payment", "token")).rejects.toBeInstanceOf(
      RateLimitConfigurationError
    );
    expect(consumePublicSettlementRateLimit).not.toHaveBeenCalled();
  });
});

describe("safe route errors and logs", () => {
  it("maps overflow to 429 with integer Retry-After and private no-store", async () => {
    const response = toRouteError(new RateLimitError(12.8));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("13");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({
      error: "リクエストが多すぎます。時間をおいて再試行してください。",
      code: "rate_limited"
    });
  });

  it("generalizes unknown route errors and never serializes the Error", async () => {
    const response = toRouteError(new Error("body=secret token=secret"));
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toMatch(/body|token|secret/i);
  });

  it("logs only the fixed safe shape", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    safeLog({ operation: "google_availability", code: "upstream_failed", status: 502, durationMs: 41 });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith(JSON.stringify({
      operation: "google_availability",
      code: "upstream_failed",
      status: 502,
      durationMs: 41
    }));
    info.mockRestore();
  });
});

if (false) {
  // @ts-expect-error safeLog must not accept arbitrary request or secret data.
  safeLog({ operation: "event_update", code: "failed", status: 500, durationMs: 1, body: "secret" });
  // @ts-expect-error safeLog must not accept Error objects.
  safeLog(new Error("secret"));
}
