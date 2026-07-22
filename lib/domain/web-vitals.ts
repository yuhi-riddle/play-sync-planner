export const pageTemplates = [
  "home",
  "events",
  "event-detail",
  "calendar",
  "connections",
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

export function mapPathnameToPageTemplate(pathname: string): PageTemplate {
  if (pathname === "/") return "home";
  if (pathname === "/events") return "events";
  if (pathname.startsWith("/events/")) return "event-detail";
  if (pathname === "/calendar" || pathname.startsWith("/calendar/")) return "calendar";
  if (pathname === "/connections" || pathname.startsWith("/connections/")) return "connections";
  return "other";
}

export function isAllowedWebVitalName(name: string): name is WebVitalName {
  return (webVitalNames as readonly string[]).includes(name);
}
