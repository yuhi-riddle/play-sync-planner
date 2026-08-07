import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SOURCE_ROOTS = ["app", "components", "lib", "tests"] as const;
const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".worktrees",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const LEGACY_HELPERS = [
  ["is", "event", "owner"].join("_"),
  ["is", "joined", "event", "member"].join("_"),
  ["have", "shared", "event"].join("_"),
  ["is", "user", "blocked"].join("_"),
  ["is", "following"].join("_")
] as const;

function walkSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) return [];

    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkSourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function legacyRpcCalls(source: string): string[] {
  const rpcMethod = [".", "rpc"].join("").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return LEGACY_HELPERS.filter((helper) =>
    new RegExp(`${rpcMethod}\\s*\\(\\s*(["'])${helper}\\1`).test(source)
  );
}

function effectivePolicyStatements(): string[] {
  const policies = new Map<string, string>();
  const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const migration of migrations) {
    const sql = readFileSync(join(migrationDirectory, migration), "utf8");
    const statements = sql.match(/\b(?:create|alter|drop)\s+policy\b[\s\S]*?;/gi) ?? [];

    for (const statement of statements) {
      const identity = statement.match(
        /\b(?:create|alter|drop)\s+policy(?:\s+if\s+exists)?\s+"([^"]+)"\s+on\s+([\w]+\.[\w]+)/i
      );
      if (!identity) continue;

      const key = `${identity[2]}.${identity[1]}`;
      if (/^\s*drop\s+policy\b/i.test(statement)) {
        policies.delete(key);
      } else {
        policies.set(key, statement);
      }
    }
  }

  return [...policies.values()];
}

describe("legacy helper guard", () => {
  it("detects a controlled legacy RPC reference", () => {
    const source = ["client", ".", "rpc", "(\"", LEGACY_HELPERS[0], "\", {})"].join("");

    expect(legacyRpcCalls(source)).toEqual([LEGACY_HELPERS[0]]);
  });

  it.each([
    [
      "a no-substitution template literal",
      ["client.rpc(", "`", LEGACY_HELPERS[1], "`", ")"].join("")
    ],
    [
      "comments and newlines between the call and argument",
      ["client.rpc", "/* deliberate gap */", "(\n\"", LEGACY_HELPERS[2], "\"\n)"].join("")
    ],
    [
      "optional element access",
      ["client?.[\"rpc\"]?.(\"", LEGACY_HELPERS[3], "\")"].join("")
    ]
  ])("detects legacy RPC calls written with %s", (_label, source) => {
    expect(legacyRpcCalls(source)).toHaveLength(1);
  });

  it("ignores comments and dynamically assembled RPC names", () => {
    const comment = ["// client.rpc(\"", LEGACY_HELPERS[0], "\")"].join("");
    const dynamicArgument = ["client.rpc(\"is_\" + \"following\")"].join("");

    expect(legacyRpcCalls(comment)).toEqual([]);
    expect(legacyRpcCalls(dynamicArgument)).toEqual([]);
  });

  it("recursively rejects legacy RPC calls from TypeScript sources", () => {
    const violations = SOURCE_ROOTS.flatMap((root) =>
      walkSourceFiles(resolve(process.cwd(), root)).flatMap((path) =>
        legacyRpcCalls(readFileSync(path, "utf8")).map(
          (helper) => `${relative(process.cwd(), path).replaceAll("\\", "/")}: ${helper}`
        )
      )
    );

    expect(violations).toEqual([]);
  });

  it("keeps effective SQL policies on private helpers", () => {
    const helperPattern = new RegExp(
      `\\b(public|private)\\.(${LEGACY_HELPERS.join("|")})\\s*\\(`,
      "g"
    );
    const violations = effectivePolicyStatements().flatMap((statement) =>
      [...statement.matchAll(helperPattern)]
        .filter((match) => match[1] !== "private")
        .map((match) => `${match[1]}.${match[2]}`)
    );

    expect(violations).toEqual([]);
  });

  it("preserves an unsafe USING clause when ALTER replaces only WITH CHECK or roles", () => {
    const unsafeHelper = `public.${LEGACY_HELPERS[0]}`;
    const migrations = [
      `create policy access_policy on public.items
       using (${unsafeHelper}(item_id) and exists (select 1 where (true)))
       with check (private.${LEGACY_HELPERS[0]}(item_id));`,
      `alter policy access_policy on public.items
       with check (private.${LEGACY_HELPERS[1]}(item_id));`,
      `alter policy access_policy on public.items to authenticated;`
    ];

    expect(effectivePolicyStatements(migrations).join("\n")).toContain(unsafeHelper);
  });

  it("tracks policy rename before later ALTER and DROP statements", () => {
    const unsafeHelper = `public.${LEGACY_HELPERS[2]}`;
    const renamedAndAltered = effectivePolicyStatements([
      `create policy old_policy on public.items using (${unsafeHelper}(first_id, second_id));`,
      `alter policy old_policy on public.items rename to renamed_policy;`,
      `alter policy renamed_policy on public.items
       using (private.${LEGACY_HELPERS[2]}(first_id, second_id));`
    ]).join("\n");

    expect(renamedAndAltered).not.toContain(unsafeHelper);
    expect(
      effectivePolicyStatements([
        `create policy old_policy on public.items using (${unsafeHelper}(first_id, second_id));`,
        `alter policy old_policy on public.items rename to renamed_policy;`,
        `drop policy renamed_policy on public.items;`
      ])
    ).toEqual([]);
  });

  it("matches quoted and unquoted policy identities correctly", () => {
    const unquotedUnsafe = `public.${LEGACY_HELPERS[0]}`;
    const quotedUnsafe = `public.${LEGACY_HELPERS[3]}`;
    const effectivePolicies = effectivePolicyStatements([
      `create policy access_policy on public.items using (${unquotedUnsafe}(item_id));`,
      `alter policy ACCESS_POLICY on PUBLIC.ITEMS using (private.${LEGACY_HELPERS[0]}(item_id));`,
      `create policy "Mixed Policy" on "Custom"."Items"
       using (${quotedUnsafe}(first_id, second_id));`,
      `alter policy "Mixed Policy" on "Custom"."Items"
       using (private.${LEGACY_HELPERS[3]}(first_id, second_id));`
    ]);
    const statements = effectivePolicies.join("\n");

    expect(effectivePolicies).toHaveLength(2);
    expect(statements).not.toContain(unquotedUnsafe);
    expect(statements).not.toContain(quotedUnsafe);
  });
});
