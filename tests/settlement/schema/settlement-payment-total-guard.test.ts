import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/021_settlement_payment_total_guard.sql");

describe("settlement payment total guard migration", () => {
  it("locks the settlement row and rejects payments that would exceed the settlement amount", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create or replace function public.enforce_settlement_payment_total");
    expect(migration).toContain("for update");
    expect(migration).toContain("raise exception");
    expect(migration).toContain("before insert on public.settlement_payments");
    expect(migration).toContain("for each row execute function public.enforce_settlement_payment_total");
  });
});
