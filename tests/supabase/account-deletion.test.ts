import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/023_account_deletion.sql");

describe("account deletion migration", () => {
  it("marks a profile as withdrawn without dropping the row", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("alter table public.profiles");
    expect(migration).toContain("deleted_at timestamptz");
  });

  it("never cascades a delete into events or settlements", () => {
    const migration = readFileSync(migrationPath, "utf8");

    // 主催イベントは on delete cascade なので、退会でauth.usersを消してはいけない。
    expect(migration).not.toContain("delete from auth.users");
    expect(migration).not.toContain("drop table");
  });
});
