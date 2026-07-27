import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isWithdrawnUserMetadata } from "@/lib/domain/account";
import { getProfileOnboardingRedirect } from "@/lib/domain/profile";

const publicPaths = new Set(["/login", "/terms", "/privacy", "/consent"]);

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  // 退会済みのアカウントは、Googleで再ログインできてしまうのでここで止める。
  // 追加のDB問い合わせを増やさないよう、退会印は user_metadata に持たせている。
  if (user && isWithdrawnUserMetadata(user.user_metadata) && request.nextUrl.pathname !== "/login") {
    await supabase.auth.signOut();
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("withdrawn", "1");
    return NextResponse.redirect(loginUrl);
  }

  if (!user || publicPaths.has(request.nextUrl.pathname) || request.nextUrl.pathname.startsWith("/auth/") || request.nextUrl.pathname.startsWith("/api/")) {
    return response;
  }

  const { data: consent, error } = await supabase.from("user_consents").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!error && !consent) {
    const consentUrl = request.nextUrl.clone();
    consentUrl.pathname = "/consent";
    consentUrl.search = "";
    consentUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(consentUrl);
  }

  if (request.nextUrl.pathname === "/onboarding/profile") {
    return response;
  }

  if (typeof user.user_metadata?.profile_onboarding_completed_at === "string") {
    return response;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profileError) {
    const onboardingPath = getProfileOnboardingRedirect(
      request.nextUrl.pathname,
      request.nextUrl.search,
      profile?.onboarding_completed_at
    );
    if (onboardingPath) {
      return NextResponse.redirect(new URL(onboardingPath, request.url));
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
};
