import { NextRequest, NextResponse } from "next/server";

import {
  CronRetentionError,
  purgeCronRetention
} from "@/lib/server/admin/cron-notifications";
import { isAuthorizedCron } from "@/lib/server/cron-auth";
import { safeLog } from "@/lib/server/safe-log";
import { hasSupabaseAdminEnv } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();

  if (!process.env.CRON_SECRET) {
    safeLog({
      operation: "cron.retention",
      code: "not_configured",
      status: 503,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 }
    );
  }

  if (!isAuthorizedCron(request)) {
    safeLog({
      operation: "cron.retention",
      code: "unauthorized",
      status: 401,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminEnv()) {
    safeLog({
      operation: "cron.retention",
      code: "admin_env_missing",
      status: 500,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "Supabase admin env is not configured" },
      { status: 500 }
    );
  }

  try {
    await purgeCronRetention();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const retentionError = error instanceof CronRetentionError ? error : null;
    safeLog({
      operation: retentionError
        ? `cron.retention.${retentionError.operation}`
        : "cron.retention",
      code: retentionError?.databaseCode ?? "database_error",
      status: 500,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json(
      { error: "保持期限を過ぎたデータを削除できませんでした。" },
      { status: 500 }
    );
  }
}
