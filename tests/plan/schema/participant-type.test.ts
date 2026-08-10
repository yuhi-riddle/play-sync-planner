import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/031_drop_guest_participant_type.sql");

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

// SQL の -- コメントを取り除いた本文。
// 「ガードがコメントの中にだけ書いてある」ような偽装で assertion をすり抜けられないようにする。
function stripSqlComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("participant_type migration", () => {
  it("既定値を registered に付け替える", () => {
    const code = stripSqlComments(readMigration());

    expect(code).toMatch(
      /alter\s+table\s+public\.participants\s+alter\s+column\s+participant_type\s+set\s+default\s+'registered'/i
    );
  });

  it("古い制約を名指しで drop してから張り直す（再実行安全）", () => {
    const code = stripSqlComments(readMigration());

    const dropIndex = code.search(/drop\s+constraint\s+if\s+exists\s+participants_type_check/i);
    const addIndex = code.search(/add\s+constraint\s+participants_type_check/i);

    expect(dropIndex).toBeGreaterThan(-1);
    expect(addIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeLessThan(addIndex);
  });

  /*
   * このマイグレーションの目的そのもの。制約の本文に 'guest' が残っていたら、
   * 名前を付け替えただけで何も閉じていない。
   */
  it("張り直した制約は guest を受け付けない", () => {
    const code = stripSqlComments(readMigration());

    const addMatch = code.match(/add\s+constraint\s+participants_type_check\s+check\s*\([\s\S]*?\);/i);
    expect(addMatch, "participants_type_check を張る文が見つからない").not.toBeNull();

    const checkBody = addMatch![0];
    expect(checkBody).not.toMatch(/'guest'/i);
    expect(checkBody).toMatch(/participant_type\s*=\s*'registered'/i);
  });

  /*
   * 'guest' の行が残ったまま制約を張ると、23514 だけが出て何件あるか分からない。
   * 先に数えて、件数を添えて止める。
   */
  it("制約を張る前に、registered でない行が無いことを確かめて止まる", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    expect(code).toMatch(/select\s+count\(\*\)[\s\S]*?from\s+public\.participants/);
    expect(code).toMatch(/raise\s+exception/);
  });

  // 制約が1本も無い瞬間を挟むので、途中で止まった状態を残さない。
  it("トランザクションで囲む", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    expect(code.trim().startsWith("begin;")).toBe(true);
    expect(code.trim().endsWith("commit;")).toBe(true);
  });

  /*
   * 列そのものはまだ使っている（lib/domain/event/event-members.ts が registered を書く）。
   * 行を消したり書き換えたりするのもこのマイグレーションの仕事ではない。
   */
  it("列を落とさない・既存の行に触れない", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    expect(code).not.toMatch(/drop\s+column/);
    expect(code).not.toMatch(/update\s+public\.participants/);
    expect(code).not.toMatch(/delete\s+from\s+public\.participants/);
    expect(code).not.toMatch(/\btruncate\b/);
  });
});
