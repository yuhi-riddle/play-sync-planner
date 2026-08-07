import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { markLegalConsentAccepted } from "@/lib/auth/legal-consent-mark";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { getProfileCallbackRedirect } from "@/lib/domain/account/profile";
import { PENDING_CONSENT_COOKIE, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/domain/account/legal";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const cookieStore = await cookies();
  const nextPath = safeNextPath(cookieStore.get("madoi_login_next")?.value);
  const pendingConsent = cookieStore.get(PENDING_CONSENT_COOKIE)?.value;
  cookieStore.delete("madoi_login_next");
  cookieStore.delete(PENDING_CONSENT_COOKIE);

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL("/login", request.url));
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (user && pendingConsent === `${TERMS_VERSION}:${PRIVACY_VERSION}`) {
      const agreedAt = new Date().toISOString();
      const { error: consentError } = await supabase.from("user_consents").upsert({
        user_id: user.id,
        terms_version: TERMS_VERSION,
        privacy_version: PRIVACY_VERSION,
        agreed_at: agreedAt
      });

      if (consentError) {
        return NextResponse.redirect(new URL("/consent", request.url));
      }

      // 正本を保存できたあとに印を書く。
      await markLegalConsentAccepted(user.id, agreedAt);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("user_id", user.id)
        .maybeSingle();
      const onboardingPath = getProfileCallbackRedirect(
        nextPath,
        profile?.onboarding_completed_at,
        profileError
      );
      if (onboardingPath) {
        return NextResponse.redirect(new URL(onboardingPath, request.url));
      }
    } else if (user) {
      return NextResponse.redirect(new URL(`/consent?next=${encodeURIComponent(nextPath)}`, request.url));
    }
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
