import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { safeNextPath } from "@/lib/auth/safe-next-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const nextPath = safeNextPath(cookieStore.get("madoi_login_next")?.value);
  cookieStore.delete("madoi_login_next");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
