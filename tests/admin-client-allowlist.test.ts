import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { expect, it } from "vitest";

const ADMIN_CLIENT_BASELINE_FILES = [
  "lib/server/admin/cron-notifications.ts",
  "lib/server/admin/google-token-store.ts",
  "lib/server/admin/public-answer.ts",
  "lib/server/admin/public-invite.ts",
  "lib/server/admin/public-settlement.ts",
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

it("allows the service-role client only inside five bounded admin modules", () => {
  expect(sourceFilesUsing("createSupabaseAdminClient").sort()).toEqual([...ADMIN_CLIENT_BASELINE_FILES].sort());
});

it("keeps admin clients and arbitrary query builders private to each wrapper", () => {
  for (const path of ADMIN_CLIENT_BASELINE_FILES.filter(
    (path) => path.startsWith("lib/server/admin/")
  )) {
    const contents = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(contents, path).not.toMatch(/export[^\n]*(?:SupabaseClient|AdminClient)/);
    expect(contents, path).not.toMatch(/return\s+(?:supabase|admin)\s*;/);
  }
});
