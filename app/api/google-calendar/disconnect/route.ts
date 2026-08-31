import { NextResponse } from "next/server";

import { isWithdrawn } from "@/lib/domain/account/withdrawal";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // /api/* は middleware を通らないので、退会済みはここで止める。
  if (isWithdrawn(user.app_metadata)) {
    return NextResponse.redirect(new URL("/login?withdrawn=1", request.url));
  }

  const supabase = await createSupabaseServerClient();
  await supabase.from("calendar_integrations").delete().eq("user_id", user.id).eq("provider", "google");

  return NextResponse.redirect(new URL("/settings?calendar=disconnected", request.url));
}
