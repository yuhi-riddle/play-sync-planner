import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/028_plan_timetable.sql");

/**
 * コメント行に退避したガードを「ある」と誤判定しないため、検証前に落とす。
 * 改行は CRLF に揃えられることがある（core.autocrlf）ので、\r ごと切り分ける。
 */
function withoutComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

describe("plan timetable migration", () => {
  it("日程調整に紐づく進行表の行を作る", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("create table if not exists public.plan_timetable_items");
    expect(migration).toContain("plan_id uuid not null references public.plans(id) on delete cascade");
    expect(migration).toContain("start_at timestamptz not null");
    expect(migration).toContain("end_at timestamptz");
  });

  it("終了時刻は開始時刻より前にできない", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("check (end_at is null or end_at >= start_at)");
  });

  it("担当は participants を指す", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("create table if not exists public.plan_timetable_item_assignees");
    expect(migration).toContain("participant_id uuid not null references public.participants(id) on delete cascade");
    expect(migration).toContain("primary key (item_id, participant_id)");
  });

  it("イベントメンバーだけが読み書きできる", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("alter table public.plan_timetable_items enable row level security");
    expect(migration).toContain("alter table public.plan_timetable_item_assignees enable row level security");
    expect(migration).toContain("public.is_event_member(");

    for (const command of ["for select", "for insert", "for update", "for delete"]) {
      expect(migration).toContain(command);
    }
  });

  it("作成者は自分自身でなければならない", () => {
    const migration = withoutComments(readFileSync(migrationPath, "utf8"));

    expect(migration).toContain("created_by_user_id = auth.uid()");
  });
});
