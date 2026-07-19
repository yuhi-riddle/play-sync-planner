import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ADMIN_CLIENT_BASELINE_FILES = [
  // /connections uses the session/RLS client and is intentionally excluded from this service-role baseline.
  "app/api/cron/notifications/route.ts",
  "app/api/events/[eventId]/availability/route.ts",
  "app/events/[eventId]/page.tsx",
  "app/invites/[token]/page.tsx",
  "app/plans/[planId]/settlement/page.tsx",
  "app/plans/page.tsx",
  "app/s/[token]/answer/page.tsx",
  "app/s/[token]/settlement/page.tsx",
  "lib/actions/answers.ts",
  "lib/actions/calendar.ts",
  "lib/actions/connections.ts",
  "lib/actions/event-members.ts",
  "lib/actions/event-messages.ts",
  "lib/actions/plans.ts",
  "lib/actions/settlements.ts",
  "lib/google-calendar/access-token.ts",
  "lib/supabase/server.ts"
] as const;

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function sourceFilesUsing(needle: string) {
  const roots = ["app", "lib"];
  return roots
    .flatMap((root) => walk(resolve(process.cwd(), root)))
    .filter((path) => /\.(ts|tsx)$/.test(path))
    .filter((path) => readFileSync(path, "utf8").includes(needle))
    .map((path) => relative(process.cwd(), path).replaceAll("\\", "/"));
}

it("captures every current service-role client usage before hardening", () => {
  expect(sourceFilesUsing("createSupabaseAdminClient").sort()).toEqual([...ADMIN_CLIENT_BASELINE_FILES].sort());
});
