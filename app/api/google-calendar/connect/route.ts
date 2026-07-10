import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next-path";
import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar/oauth";
import { getCurrentUser } from "@/lib/supabase/server";

function calendarConnectPath(nextPath: string) {
  return `/api/google-calendar/connect?next=${encodeURIComponent(nextPath)}`;
}

export async function GET(request: NextRequest) {
  const requestedNext = request.nextUrl.searchParams.get("next");
  const nextPath = requestedNext ? safeNextPath(requestedNext) : "/settings";
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(calendarConnectPath(nextPath))}`, request.url));
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  };
  cookieStore.set("madoi_calendar_oauth_state", state, cookieOptions);
  cookieStore.set("madoi_calendar_next", nextPath, cookieOptions);

  return NextResponse.redirect(buildGoogleCalendarAuthUrl({ state }));
}
