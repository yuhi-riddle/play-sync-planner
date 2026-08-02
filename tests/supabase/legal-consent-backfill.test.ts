import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/026_legal_consent_app_metadata.sql");

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

describe("legal consent backfill migration", () => {
  it("user_consents の同意日時を auth.users の app_metadata へ移す", () => {
    const migration = readMigration();

    expect(migration).toContain("update auth.users");
    expect(migration).toContain("raw_app_meta_data");
    expect(migration).toContain("legal_consent_accepted_at");
    expect(migration).toContain("public.user_consents");
  });

  it("ミリ秒未満を切り捨ててから整形する（四捨五入による桁あふれを防ぐ）", () => {
    const code = stripSqlComments(readMigration());

    // to_char() に渡す直前の式を取り出す。引数の中に date_trunc(...) のカンマがあるため
    // 最初のカンマで止まらず、to_char(引数, フォーマット) の区切りまで広がるはず。
    const toCharMatch = code.match(/to_char\(\s*([\s\S]*?),\s*'YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"'\s*\)/);
    expect(toCharMatch, "to_char(...) での ISO8601 整形が見つからない").not.toBeNull();

    const toCharArg = toCharMatch![1];

    // MS フィールドは四捨五入されるため、切り捨て（date_trunc）を先に行わないと
    // 999.9995ms のような値が繰り上がらずに桁あふれした文字列になる。
    expect(toCharArg).toMatch(/date_trunc\(\s*'milliseconds'\s*,/i);

    // 切り捨て対象が UTC 変換後の値であること（'Z' 終端の主張と矛盾しないように）
    expect(toCharArg).toMatch(/at time zone\s+'utc'/i);
  });

  it("既に印がある行を上書きしない：ガードが WHERE 句の内側にある", () => {
    const code = stripSqlComments(readMigration());

    const whereIndex = code.search(/\bwhere\b/i);
    expect(whereIndex, "WHERE 句が見つからない").toBeGreaterThanOrEqual(0);

    // ステートメント終端（;）までを WHERE 句として扱う
    const semicolonIndex = code.indexOf(";", whereIndex);
    const whereClause = semicolonIndex >= 0 ? code.slice(whereIndex, semicolonIndex) : code.slice(whereIndex);

    // WHERE 句の外（コメントや別の場所）に同じトークンがあるだけでは合格しない。
    expect(whereClause).toMatch(
      /not\s*\(\s*coalesce\([^)]*raw_app_meta_data[^)]*\)\s*\?\s*'legal_consent_accepted_at'\s*\)/i,
    );
  });

  it("同意の正本である public.user_consents を一切変更しない（読み取り専用）", () => {
    const code = stripSqlComments(readMigration()).toLowerCase();

    // update / delete / truncate / drop / insert / alter で public.user_consents を
    // 対象にする文を幅広く検出する。FROM/JOIN での読み取り参照は誤検出しない。
    const destructivePattern =
      /\b(update|delete\s+from|truncate(?:\s+table)?|drop\s+table|insert\s+into|alter\s+table)\s+public\.user_consents\b/;

    expect(code).not.toMatch(destructivePattern);
  });
});
