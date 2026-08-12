import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/027_user_consents_no_delete.sql");

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

// SQL の -- コメントを取り除いた本文。
// 「ガードがコメントの中にだけ書いてある」ような偽装で assertion をすり抜けられないようにする。
// 改行は CRLF に揃えられることがある（core.autocrlf）。`.` は \r にマッチしないので、
// 行末の \r を残したままだと -- のコメントが落ちない。
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("user_consents policy migration", () => {
  it("migration 016 の古いポリシーを名指しで drop する（再実行安全）", () => {
    const code = stripSqlComments(readMigration());

    expect(code).toMatch(
      /drop\s+policy\s+if\s+exists\s+"Users can manage their own consent"\s+on\s+public\.user_consents/i
    );
  });

  it("user_consents に対して for all ポリシーを作らない（DELETEを含めないため）", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    // create policy ... for all ... on public.user_consents という形を幅広く検出する。
    // for句とon句の順序はどちらもありうるため両方向で見る。
    const forAllThenOnUserConsents = /create\s+policy[^;]*?for\s+all[^;]*?on\s+public\.user_consents/i;
    const onUserConsentsThenForAll = /create\s+policy[^;]*?on\s+public\.user_consents[^;]*?for\s+all/i;

    expect(code).not.toMatch(forAllThenOnUserConsents);
    expect(code).not.toMatch(onUserConsentsThenForAll);
  });

  it("user_consents に対して DELETE を許可するポリシーを作らない", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    const forDeleteThenOnUserConsents = /create\s+policy[^;]*?for\s+delete[^;]*?on\s+public\.user_consents/i;
    const onUserConsentsThenForDelete = /create\s+policy[^;]*?on\s+public\.user_consents[^;]*?for\s+delete/i;

    expect(code).not.toMatch(forDeleteThenOnUserConsents);
    expect(code).not.toMatch(onUserConsentsThenForDelete);
  });

  it("select / insert / update の3つのポリシーを、それぞれ正しい句の組み合わせで作る", () => {
    const code = stripSqlComments(readMigration());

    // select: using のみ（with check は不要）
    expect(code).toMatch(
      /create\s+policy\s+"Users can view their own consent"[\s\S]*?on\s+public\.user_consents[\s\S]*?for\s+select[\s\S]*?to\s+authenticated[\s\S]*?using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i
    );

    // insert: with check のみ
    expect(code).toMatch(
      /create\s+policy\s+"Users can insert their own consent"[\s\S]*?on\s+public\.user_consents[\s\S]*?for\s+insert[\s\S]*?to\s+authenticated[\s\S]*?with\s+check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i
    );

    // update: using と with check の両方
    const updateMatch = code.match(
      /create\s+policy\s+"Users can update their own consent"[\s\S]*?on\s+public\.user_consents[\s\S]*?for\s+update[\s\S]*?to\s+authenticated[\s\S]*?;/i
    );
    expect(updateMatch, "update ポリシーが見つからない").not.toBeNull();
    const updateBlock = updateMatch![0];
    expect(updateBlock).toMatch(/using\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i);
    expect(updateBlock).toMatch(/with\s+check\s*\(\s*user_id\s*=\s*auth\.uid\(\)\s*\)/i);
  });

  it("insert ポリシーに using句を持たせない・select ポリシーに with check を持たせない", () => {
    const code = stripSqlComments(readMigration());

    const insertMatch = code.match(
      /create\s+policy\s+"Users can insert their own consent"[\s\S]*?;/i
    );
    expect(insertMatch).not.toBeNull();
    expect(insertMatch![0]).not.toMatch(/\busing\s*\(/i);

    const selectMatch = code.match(
      /create\s+policy\s+"Users can view their own consent"[\s\S]*?;/i
    );
    expect(selectMatch).not.toBeNull();
    expect(selectMatch![0]).not.toMatch(/with\s+check\s*\(/i);
  });

  it("event_drafts のポリシーには触れない（このマイグレーションのスコープ外）", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    expect(code).not.toContain("event_drafts");
  });

  it("テーブルの列・データ・RLS有効化状態を変更しない", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    expect(code).not.toMatch(/alter\s+table\s+public\.user_consents\s+(add|drop|alter)\s+column/);
    expect(code).not.toMatch(/\benable\s+row\s+level\s+security\b/);
    expect(code).not.toMatch(/\bdisable\s+row\s+level\s+security\b/);
    expect(code).not.toMatch(/\btruncate\b/);
    expect(code).not.toMatch(/\bdelete\s+from\s+public\.user_consents\b/);
  });

  it("DELETEを外す理由（正本であること、印が自己修復しなくなったこと）を日本語コメントで説明する", () => {
    const migration = readMigration();

    expect(migration).toMatch(/正本/);
    expect(migration).toMatch(/app_metadata/);
  });
});
