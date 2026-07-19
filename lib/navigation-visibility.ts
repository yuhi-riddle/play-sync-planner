const hiddenExactPaths = new Set(["/login", "/consent", "/terms", "/privacy"]);
const hiddenPrefixes = ["/auth/", "/onboarding/", "/s/", "/invites/"];
const focusedExactPaths = new Set(["/events/new"]);
const focusedPatterns = [
  /^\/events\/[^/]+\/edit$/,
  /^\/events\/[^/]+\/plans\/new$/,
  /^\/plans\/[^/]+\/edit$/,
  /^\/plans\/[^/]+\/confirm$/
];

export function shouldShowPrimaryNavigation(pathname: string) {
  if (hiddenExactPaths.has(pathname)) return false;
  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) return false;
  if (focusedExactPaths.has(pathname)) return false;
  return !focusedPatterns.some((pattern) => pattern.test(pathname));
}
