import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NextRequest } from "next/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createCronNotifications,
  createSupabaseAdminClient,
  hasSupabaseAdminEnv,
  rpc,
  safeLog
} = vi.hoisted(() => ({
  createCronNotifications: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  hasSupabaseAdminEnv: vi.fn(),
  rpc: vi.fn(),
  safeLog: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient,
  hasSupabaseAdminEnv
}));
vi.mock("@/lib/server/safe-log", () => ({ safeLog }));
vi.mock("@/lib/server/admin/cron-notifications", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/admin/cron-notifications")>()),
  createCronNotifications
}));

import { GET as getNotifications } from "@/app/api/cron/notifications/route";
import { GET as runRetention } from "@/app/api/cron/retention/route";
import { isAuthorizedCron } from "@/lib/server/cron-auth";

const originalSecret = process.env.CRON_SECRET;

function cronRequest(pathname: string, authorization?: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: authorization ? { authorization } : undefined
  });
}

describe("shared cron authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    hasSupabaseAdminEnv.mockReturnValue(true);
    createSupabaseAdminClient.mockReturnValue({ rpc });
    createCronNotifications.mockResolvedValue(0);
    rpc.mockResolvedValue({ data: 1, error: null });
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("fails closed and accepts only the exact bearer value", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(cronRequest("/api/cron/notifications"))).toBe(false);

    process.env.CRON_SECRET = "cron-secret";
    expect(isAuthorizedCron(cronRequest("/api/cron/notifications", "cron-secret"))).toBe(false);
    expect(isAuthorizedCron(cronRequest("/api/cron/notifications", "Bearer wrong"))).toBe(false);
    expect(isAuthorizedCron(cronRequest("/api/cron/notifications", "bearer cron-secret"))).toBe(false);
    expect(isAuthorizedCron(cronRequest("/api/cron/notifications", "Bearer cron-secret"))).toBe(true);
  });

  it("uses the shared helper from both cron routes", () => {
    const notifications = readFileSync(
      resolve(process.cwd(), "app/api/cron/notifications/route.ts"),
      "utf8"
    );
    const retention = readFileSync(
      resolve(process.cwd(), "app/api/cron/retention/route.ts"),
      "utf8"
    );

    expect(notifications).toContain('from "@/lib/server/cron-auth"');
    expect(retention).toContain('from "@/lib/server/cron-auth"');
  });

  it("logs a bounded notification auth failure without calling admin code", async () => {
    const response = await getNotifications(
      cronRequest("/api/cron/notifications", "Bearer wrong")
    );

    expect(response.status).toBe(401);
    expect(createCronNotifications).not.toHaveBeenCalled();
    expect(safeLog).toHaveBeenCalledWith({
      operation: "cron.notifications",
      code: "unauthorized",
      status: 401,
      durationMs: expect.any(Number)
    });
  });

  it("runs both retention RPCs in order with the same exact bearer auth", async () => {
    const response = await runRetention(
      cronRequest("/api/cron/retention", "Bearer cron-secret")
    );

    expect(response.status).toBe(200);
    expect(rpc.mock.calls.map(([operation]) => operation)).toEqual([
      "purge_expired_security_data",
      "purge_expired_web_vitals"
    ]);
  });

  it("logs only the failed retention operation and database code", async () => {
    rpc.mockResolvedValueOnce({
      data: [{ secret: "must-not-be-logged" }],
      error: {
        code: "P0001",
        message: "contains a secret",
        details: "deleted row data"
      }
    });

    const response = await runRetention(
      cronRequest("/api/cron/retention", "Bearer cron-secret")
    );

    expect(response.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(safeLog).toHaveBeenCalledWith({
      operation: "cron.retention.purge_expired_security_data",
      code: "P0001",
      status: 500,
      durationMs: expect.any(Number)
    });
    expect(JSON.stringify(safeLog.mock.calls)).not.toContain("contains a secret");
    expect(JSON.stringify(safeLog.mock.calls)).not.toContain("deleted row data");
    expect(JSON.stringify(safeLog.mock.calls)).not.toContain("must-not-be-logged");
  });

  it("does not log an invalid database code", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001 secret-token", message: "failure" }
    });

    await runRetention(
      cronRequest("/api/cron/retention", "Bearer cron-secret")
    );

    expect(safeLog).toHaveBeenCalledWith(expect.objectContaining({
      code: "database_error"
    }));
    expect(JSON.stringify(safeLog.mock.calls)).not.toContain("secret-token");
  });
});
