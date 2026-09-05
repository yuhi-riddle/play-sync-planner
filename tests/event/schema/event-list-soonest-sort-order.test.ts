import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/048_event_list_soonest_sort_order.sql"
);
const migration047Path = resolve(
  process.cwd(),
  "supabase/migrations/047_event_list_progress_state_filter.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

/** order by 句を「,」区切りのキー配列にし、空白を潰したうえで soonest 絡みのキーを除く。 */
function nonSoonestKeys(orderBy: string): string[] {
  return orderBy
    .split(",")
    .map((key) => key.trim().replace(/\s+/g, " "))
    .filter((key) => key.length > 0)
    .filter((key) => !/soonest/.test(key));
}

/** SQL の -- コメントを取り除いた本文。コメント内の文字列で assertion をすり抜けさせない。 */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** row_number() over ( order by ... ) as ordinal の order by 部分だけを取り出す。 */
function extractOrderBy(code: string): string {
  const match = code.match(/row_number\(\)\s+over\s*\(\s*order by([\s\S]*?)\)\s*as ordinal/i);
  expect(match, "ordered CTE の order by が見つからない").not.toBeNull();
  return match![1];
}

describe("event list soonest 並び順の migration 048", () => {
  it("シグネチャは変えず create or replace で作り直す（drop しない）", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/create or replace function public\.list_owned_event_ids/i);
    expect(code).toContain("p_display_state text default 'all'");
    // 引数は増えないので旧シグネチャを落とす必要はない
    expect(code).not.toMatch(/drop function/i);
  });

  it("soonest は未来バケツ→過去バケツ→日付なし、の順のキーを持つ", () => {
    const orderBy = extractOrderBy(stripSqlComments(readMigration()));

    const bucketKey = orderBy.indexOf(
      "case when sort_value = 'soonest' then (schedule_start < now()) end asc nulls last"
    );
    const futureKey = orderBy.indexOf(
      "case when sort_value = 'soonest' and schedule_start >= now() then schedule_start end asc"
    );
    const pastKey = orderBy.indexOf(
      "case when sort_value = 'soonest' and schedule_start < now() then schedule_start end desc"
    );

    expect(bucketKey, "未来/過去のバケツ分けキーが無い").toBeGreaterThanOrEqual(0);
    expect(futureKey, "未来バケツ内の昇順キーが無い").toBeGreaterThanOrEqual(0);
    expect(pastKey, "過去バケツ内の降順キーが無い").toBeGreaterThanOrEqual(0);
    expect(bucketKey).toBeLessThan(futureKey);
    expect(futureKey).toBeLessThan(pastKey);
  });

  it("直っていない素朴な soonest キー（単純な昇順）は残さない", () => {
    const orderBy = extractOrderBy(stripSqlComments(readMigration()));
    expect(orderBy).not.toContain(
      "case when sort_value = 'soonest' then schedule_start end asc nulls last"
    );
  });

  it("soonest 以外のキー（newest / latest / タイブレーク）は 047 と完全一致", () => {
    const from048 = nonSoonestKeys(extractOrderBy(stripSqlComments(readMigration())));
    const from047 = nonSoonestKeys(
      extractOrderBy(stripSqlComments(readFileSync(migration047Path, "utf8")))
    );
    // soonest のキーを除いたら、残りの内容も並び順も 047 と1文字違わないはず。
    expect(from047).toEqual([
      "case when sort_value = 'newest' then created_at end desc nulls last",
      "case when sort_value = 'latest' then schedule_start end desc nulls last",
      "created_at desc",
      "id desc"
    ]);
    expect(from048).toEqual(from047);
  });
});
