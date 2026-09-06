import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/049_event_auto_completion.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

/** SQL の -- コメントを除いた本文。コメント内の文字列で assertion をすり抜けさせない。 */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("event auto-completion migration 049", () => {
  it("events に wrapup_snoozed_until / wrapup_auto_done を足す", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/add column if not exists wrapup_snoozed_until timestamptz/i);
    expect(code).toMatch(/add column if not exists wrapup_auto_done boolean not null default false/i);
  });

  it("status で絞る部分 index を作る", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(
      /create index if not exists events_wrapup_scan_idx[\s\S]*?on public\.events \(status\)[\s\S]*?where status in \('planning', 'confirmed'\)/i
    );
  });

  it("notifications_kind_check を張り直して wrapup 種別を足す（既存も残す）", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/drop constraint if exists notifications_kind_check/i);
    const checkMatch = code.match(/add constraint notifications_kind_check check \(([\s\S]*?)\)\s*;/i);
    expect(checkMatch, "kind check が見つからない").not.toBeNull();
    const list = checkMatch![1];
    for (const kind of [
      "answer_deadline",
      "unanswered",
      "answer_received",
      "settlement_needed",
      "payment_due",
      "confirmation_due",
      "event_invitation",
      "event_message",
      "wrapup_prompt",
      "wrapup_done"
    ]) {
      expect(list, `${kind} が kind check に無い`).toContain(`'${kind}'`);
    }
  });

  it("最終開催日が90日超前の planning/confirmed を恒久スヌーズするバックフィルがある", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/update public\.events/i);
    expect(code).toMatch(/wrapup_snoozed_until = '2999-01-01/i);
    expect(code).toMatch(/now\(\) - interval '90 days'/i);
    expect(code).toMatch(/wrapup_snoozed_until is null/i);
  });
});
