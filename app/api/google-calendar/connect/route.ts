import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar/oauth";
import { getCurrentUser } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("madoi_calendar_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60
  });

  return NextResponse.redirect(buildGoogleCalendarAuthUrl({ state }));
}
