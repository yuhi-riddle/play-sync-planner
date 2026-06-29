import { NextResponse } from "next/server";

import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("calendar_integrations").delete().eq("user_id", user.id).eq("provider", "google");

  return NextResponse.redirect(new URL("/settings?calendar=disconnected", request.url));
}
