export const pageTemplates = [
  "home",
  "events",
  "event-new",
  "event-detail",
  "event-edit",
  "plan-new",
  "plans",
  "plan-detail",
  "plan-edit",
  "plan-confirm",
  "settlement",
  "notifications",
  "connections",
  "settings",
  "settings-withdraw",
  "login",
  "consent",
  "onboarding",
  "invite",
  "share-answer",
  "share-answer-complete",
  "share-settlement",
  "legal",
  "other"
] as const;
export const webVitalNames = ["LCP", "INP", "CLS"] as const;
export const deviceClasses = ["mobile", "desktop"] as const;

export type PageTemplate = (typeof pageTemplates)[number];
export type WebVitalName = (typeof webVitalNames)[number];
export type DeviceClass = (typeof deviceClasses)[number];

export type WebVitalInput = {
  page: PageTemplate;
  name: WebVitalName;
  value: number;
  device: DeviceClass;
};

/**
 * pathname を "/" 区切りのセグメント配列にする。
 * 末尾スラッシュや空セグメントは無視するので、"/events/" と "/events" は同じ扱いになる。
 */
function segmentsOf(pathname: string): string[] {
  return pathname.split("/").filter((segment) => segment.length > 0);
}

/**
 * 動的セグメント（[eventId] / [planId] / [token] など）はセグメント数と
 * 固定文字列の位置一致だけで判定する。値そのものは問わない。
 *
 * 分岐順序が重要: より深い（セグメント数が多い）ルートを先に判定すること。
 * 例) "/events/[id]/plans/new" は "/events/[id]" より先に見る。
 */
export function mapPathnameToPageTemplate(pathname: string): PageTemplate {
  const segments = segmentsOf(pathname);

  if (segments.length === 0) return "home";

  // /events...
  if (segments[0] === "events") {
    if (segments.length === 1) return "events";
    if (segments.length === 2 && segments[1] === "new") return "event-new";
    if (segments.length === 4 && segments[2] === "plans" && segments[3] === "new") return "plan-new";
    if (segments.length === 3 && segments[2] === "edit") return "event-edit";
    if (segments.length === 2) return "event-detail";
    return "other";
  }

  // /plans...
  if (segments[0] === "plans") {
    if (segments.length === 1) return "plans";
    if (segments.length === 3 && segments[2] === "edit") return "plan-edit";
    if (segments.length === 3 && segments[2] === "confirm") return "plan-confirm";
    if (segments.length === 3 && segments[2] === "settlement") return "settlement";
    if (segments.length === 2) return "plan-detail";
    return "other";
  }

  // /s/[token]/...
  if (segments[0] === "s") {
    if (segments.length === 4 && segments[2] === "answer" && segments[3] === "complete") return "share-answer-complete";
    if (segments.length === 3 && segments[2] === "answer") return "share-answer";
    if (segments.length === 3 && segments[2] === "settlement") return "share-settlement";
    return "other";
  }

  // /settings...
  if (segments[0] === "settings") {
    if (segments.length === 1) return "settings";
    if (segments.length === 2 && segments[1] === "withdraw") return "settings-withdraw";
    return "other";
  }

  // /onboarding/profile
  if (segments[0] === "onboarding" && segments.length === 2 && segments[1] === "profile") return "onboarding";

  // /invites/[token]
  if (segments[0] === "invites" && segments.length === 2) return "invite";

  if (segments.length === 1) {
    if (segments[0] === "notifications") return "notifications";
    if (segments[0] === "connections") return "connections";
    if (segments[0] === "login") return "login";
    if (segments[0] === "consent") return "consent";
    if (segments[0] === "terms" || segments[0] === "privacy") return "legal";
  }

  return "other";
}

export function isAllowedWebVitalName(name: string): name is WebVitalName {
  return (webVitalNames as readonly string[]).includes(name);
}
