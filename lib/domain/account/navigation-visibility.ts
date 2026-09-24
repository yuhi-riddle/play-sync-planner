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

export type NavigationChrome = {
  /** 主要ナビ（PCではヘッダー下のナビ） */
  primaryNav: boolean;
  /** イベント作成ボタン（FAB）。一覧系の画面だけに出る */
  createFab: boolean;
  /** スマホで固定ナビとFABに隠されないための下余白 */
  bottomInset: boolean;
};

const createFabPaths = new Set(["/events", "/plans"]);

/** 画面ごとに、ナビまわりの表示可否をまとめて決める。判定はここだけにする。 */
export function getNavigationChrome(pathname: string, isSignedIn: boolean): NavigationChrome {
  const primaryNav = isSignedIn && shouldShowPrimaryNavigation(pathname);

  return {
    primaryNav,
    createFab: primaryNav && createFabPaths.has(pathname),
    bottomInset: primaryNav
  };
}
