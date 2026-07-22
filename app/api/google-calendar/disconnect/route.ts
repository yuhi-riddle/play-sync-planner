import { NextResponse } from "next/server";

import { consumeAuthenticatedLimit } from "@/lib/server/rate-limit";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createSupabaseServerClient();
  try {
    await consumeAuthenticatedLimit("google_calendar_update");
    const { error } = await supabase
      .from("calendar_integrations")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", "google");
    if (error) throw new Error("disconnect_failed");

    const { error: auditError } = await supabase.rpc("record_security_audit", {
      operation: "google_calendar_disconnect",
      target_type: "calendar_integration",
      target_id: user.id,
      outcome: "success"
    });
    if (auditError) throw new Error("audit_failed");
  } catch {
    return NextResponse.redirect(new URL("/settings?calendar=error", request.url));
  }

  return NextResponse.redirect(new URL("/settings?calendar=disconnected", request.url));
}
