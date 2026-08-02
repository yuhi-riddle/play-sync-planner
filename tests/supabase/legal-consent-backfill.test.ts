import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/026_legal_consent_app_metadata.sql");

describe("legal consent backfill migration", () => {
  it("user_consents の同意日時を auth.users の app_metadata へ移す", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("update auth.users");
    expect(migration).toContain("raw_app_meta_data");
    expect(migration).toContain("legal_consent_accepted_at");
    expect(migration).toContain("public.user_consents");
  });

  it("既に印がある行を上書きしない（再実行しても結果が変わらない）", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("? 'legal_consent_accepted_at'");
  });

  it("同意の正本であるテーブルを消さない", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).not.toContain("drop table");
    expect(migration).not.toContain("delete from public.user_consents");
  });
});
