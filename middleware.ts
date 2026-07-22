import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getProfileOnboardingRedirect } from "@/lib/domain/profile";

const publicPaths = new Set(["/login", "/terms", "/privacy", "/consent"]);
const securityHeaders = {
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff"
} as const;

type ContentSecurityPolicyOptions = {
  nonce: string;
  isDevelopment: boolean;
  supabaseUrl: string | undefined;
};

export function buildContentSecurityPolicy({
  nonce,
  isDevelopment,
  supabaseUrl
}: ContentSecurityPolicyOptions): string {
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
  const imageSources = [
    "'self'",
    "blob:",
    "data:",
    "https://*.googleusercontent.com",
    ...(supabaseOrigin ? [supabaseOrigin] : [])
  ];

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

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy({
    nonce,
    isDevelopment: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL
  });
  const cspHeader = process.env.CSP_REPORT_ONLY === "true"
    ? "Content-Security-Policy-Report-Only"
    : "Content-Security-Policy";
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set(cspHeader, csp);

  let response = createNextResponse(requestHeaders, cspHeader, csp);
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
        response = createNextResponse(requestHeaders, cspHeader, csp);
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return response;
  }

  const { data: consent, error } = await supabase.from("user_consents").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!error && !consent) {
    const consentUrl = request.nextUrl.clone();
    consentUrl.pathname = "/consent";
    consentUrl.search = "";
    consentUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return applySecurityHeaders(NextResponse.redirect(consentUrl), cspHeader, csp);
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
      return applySecurityHeaders(
        NextResponse.redirect(new URL(onboardingPath, request.url)),
        cspHeader,
        csp
      );
    }
  }

  return response;
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
  return publicPaths.has(pathname)
    || pathname.startsWith("/auth/")
    || pathname.startsWith("/api/");
}

function createNextResponse(
  requestHeaders: Headers,
  cspHeader: string,
  csp: string
): NextResponse {
  return applySecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    cspHeader,
    csp
  );
}

function applySecurityHeaders(
  response: NextResponse,
  cspHeader: string,
  csp: string
): NextResponse {
  response.headers.set(cspHeader, csp);
  for (const [name, value] of Object.entries(securityHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"]
};
