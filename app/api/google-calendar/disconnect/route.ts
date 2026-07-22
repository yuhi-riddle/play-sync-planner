import { NextResponse } from "next/server";

import { recordGoogleCalendarDisconnectAudit } from "@/lib/server/admin/google-token-store";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createSupabaseServerClient();
  try {
    const { error } = await supabase
      .from("calendar_integrations")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "google");
    if (error) throw new Error("disconnect_failed");

    await recordGoogleCalendarDisconnectAudit(user.id);
  } catch {
    return NextResponse.redirect(new URL("/settings?calendar=error", request.url));
  }

  return NextResponse.redirect(new URL("/settings?calendar=disconnected", request.url));
}
