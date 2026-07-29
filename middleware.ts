import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isWithdrawnUserMetadata } from "@/lib/domain/account";
import { getProfileOnboardingRedirect } from "@/lib/domain/profile";

const publicPaths = new Set(["/login", "/terms", "/privacy", "/consent"]);

// 公開清算リンクのトークンが外部サイトへ漏れないよう、クロスオリジンではoriginのみ送る。
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
} as const;

type ContentSecurityPolicyOptions = {
  nonce: string;
  isDevelopment: boolean;
  supabaseUrl: string | undefined;
};

/**
 * script-src はnonceだけを許可し、'unsafe-inline'を使わない。
 * インラインscriptタグが無いこのアプリでは、Next.js自身が発行するscriptにこのnonceを
 * 自動で付与する(middlewareでリクエストヘッダーにx-nonceを転送する規約に従っている)。
 */
export function buildContentSecurityPolicy({ nonce, isDevelopment, supabaseUrl }: ContentSecurityPolicyOptions): string {
  const supabaseOrigin = getOrigin(supabaseUrl);
  const supabaseWebSocketOrigin = supabaseOrigin?.replace(/^http/, "ws");
  const scriptSources = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (isDevelopment) scriptSources.push("'unsafe-eval'");

  const connectSources = [
    "'self'",
    "https://www.googleapis.com",
    ...(supabaseOrigin ? [supabaseOrigin] : []),
    ...(supabaseWebSocketOrigin ? [supabaseWebSocketOrigin] : []),
    ...(isDevelopment ? ["http:", "ws:"] : [])
  ];
  const imageSources = ["'self'", "blob:", "data:", "https://*.googleusercontent.com", ...(supabaseOrigin ? [supabaseOrigin] : [])];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imageSources.join(" ")}`,
    "font-src 'self' data:",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "frame-src https://accounts.google.com",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'"
  ].join("; ");
}

function getOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function isPublicRequest(pathname: string): boolean {
  return (
    publicPaths.has(pathname) ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/invites/")
  );
}

function applySecurityHeaders(response: NextResponse, cspHeaderName: string, csp: string): NextResponse {
  response.headers.set(cspHeaderName, csp);
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
  });
  // 事故った時にコード変更なしで戻せるよう、環境変数だけでReport-Onlyへ切り替えられるようにしておく。
  const cspHeaderName = process.env.CSP_REPORT_ONLY === "true" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

  function nextWithHeaders(nextRequest: NextRequest) {
    const requestHeaders = new Headers(nextRequest.headers);
    requestHeaders.set("x-nonce", nonce);
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), cspHeaderName, csp);
  }

  let response = nextWithHeaders(request);

  if (isPublicRequest(request.nextUrl.pathname)) {
    return response;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = nextWithHeaders(request);
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
    return applySecurityHeaders(NextResponse.redirect(loginUrl), cspHeaderName, csp);
  }

  if (!user) {
    return response;
  }

  // 同意チェックとオンボーディングチェックは互いに独立なので並列で発行する。
  // ただしオンボーディングチェックは本来スキップされる条件（対象パス自身/既にuser_metadataで完了済み）
  // があるため、先にそれを判定してから並列化する。無条件に並列化すると、
  // 引かなくてよいprofilesまで毎回引いてしまい逆効果になる。
  const needsProfileCheck =
    request.nextUrl.pathname !== "/onboarding/profile" &&
    typeof user.user_metadata?.profile_onboarding_completed_at !== "string";

  const [consentResult, profileResult] = await Promise.all([
    supabase.from("user_consents").select("user_id").eq("user_id", user.id).maybeSingle(),
    needsProfileCheck
      ? supabase.from("profiles").select("onboarding_completed_at").eq("user_id", user.id).maybeSingle()
      : Promise.resolve(null)
  ]);

  const { data: consent, error } = consentResult;
  if (!error && !consent) {
    const consentUrl = request.nextUrl.clone();
    consentUrl.pathname = "/consent";
    consentUrl.search = "";
    consentUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return applySecurityHeaders(NextResponse.redirect(consentUrl), cspHeaderName, csp);
  }

  if (!needsProfileCheck) {
    return response;
  }

  const profile = profileResult?.data;
  const profileError = profileResult?.error;

  if (!profileError) {
    const onboardingPath = getProfileOnboardingRedirect(
      request.nextUrl.pathname,
      request.nextUrl.search,
      profile?.onboarding_completed_at
    );
    if (onboardingPath) {
      return applySecurityHeaders(NextResponse.redirect(new URL(onboardingPath, request.url)), cspHeaderName, csp);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
};
