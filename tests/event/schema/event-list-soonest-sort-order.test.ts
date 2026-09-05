import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/048_event_list_soonest_sort_order.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
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

  it("newest / latest のキーは 047 のまま", () => {
    const orderBy = extractOrderBy(stripSqlComments(readMigration()));
    expect(orderBy).toContain("case when sort_value = 'newest' then created_at end desc nulls last");
    expect(orderBy).toContain("case when sort_value = 'latest' then schedule_start end desc nulls last");
  });
});
