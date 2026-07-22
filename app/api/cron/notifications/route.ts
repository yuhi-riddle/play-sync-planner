import { NextRequest, NextResponse } from "next/server";

import { createCronNotifications } from "@/lib/server/admin/cron-notifications";
import { hasSupabaseAdminEnv } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 }
    );
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasSupabaseAdminEnv()) {
    return NextResponse.json(
      { error: "Supabase admin env is not configured" },
      { status: 500 }
    );
  }

  try {
    const created = await createCronNotifications(new Date());
    return NextResponse.json({ created });
  } catch {
    return NextResponse.json({ error: "通知を作成できませんでした。" }, { status: 500 });
  }
}

function isAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}
