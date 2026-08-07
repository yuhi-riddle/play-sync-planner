import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/024_event_tasks.sql");

describe("event tasks migration", () => {
  it("イベントに紐づく分担リストを作る", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("create table if not exists public.event_tasks");
    expect(migration).toContain("event_id uuid not null references public.events(id) on delete cascade");
    expect(migration).toContain("assignee_user_id uuid references auth.users(id) on delete set null");
    expect(migration).toContain("done_at timestamptz");
  });

  it("参加済みメンバーだけが読み書きできるようにする", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("alter table public.event_tasks enable row level security");
    expect(migration).toContain("public.is_event_member(event_id)");

    for (const command of ["for select", "for insert", "for update", "for delete"]) {
      expect(migration).toContain(command);
    }
  });
});
