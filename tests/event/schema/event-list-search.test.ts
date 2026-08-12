import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/029_event_list_search.sql");

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

// SQL の -- コメントを取り除いた本文。
// 「ガードがコメントの中にだけ書いてある」ような偽装で assertion をすり抜けられないようにする。
// 改行は CRLF に揃えられることがある（core.autocrlf）ので、\r ごと切り分ける。
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("event list search migration", () => {
  /*
   * 検索語をそのまま ilike に渡すと、「%」の1文字で全件一致になる。
   * 絞り込みの意味が消えるだけでなく、他人のイベントは owner_user_id で守られているとはいえ、
   * 自分の全件を意図せず引くことになる。
   */
  it("ilike のワイルドカードを潰してから使う", () => {
    const code = stripSqlComments(readMigration());

    const escapeMatch = code.match(/replace\([\s\S]*?p_query[\s\S]*?\)\s+end as query_value/i);
    expect(escapeMatch, "query_value を組み立てる式が見つからない").not.toBeNull();

    const expression = escapeMatch![0];
    expect(expression).toContain("'\\', '\\\\'");
    expect(expression).toContain("'%', '\\%'");
    expect(expression).toContain("'_', '\\_'");
  });

  /*
   * `\` を最後に処理すると、`%` を潰すために足した `\` 自身をもう一度エスケープしてしまう。
   * 順番そのものが正しさの一部なので、位置関係を見る。
   */
  it("バックスラッシュを最初に潰す", () => {
    const code = stripSqlComments(readMigration());

    const backslash = code.indexOf("'\\', '\\\\'");
    const percent = code.indexOf("'%', '\\%'");
    const underscore = code.indexOf("'_', '\\_'");

    expect(backslash).toBeGreaterThan(-1);
    expect(backslash).toBeLessThan(percent);
    expect(backslash).toBeLessThan(underscore);
  });

  // 上限は TS 側の normalizeEventSearch と揃える。ずれると切れる位置が食い違う。
  it("検索語を100文字で切る", () => {
    expect(stripSqlComments(readMigration())).toMatch(/left\(btrim\(p_query\),\s*100\)/i);
  });

  // 空文字を渡されたときに「空文字で検索」してしまうと、常に全件一致になる。
  it("空の検索語は「検索していない」として扱う", () => {
    expect(stripSqlComments(readMigration())).toMatch(/nullif\(btrim\(coalesce\(p_query,\s*''\)\),\s*''\)\s+is null/i);
  });

  /*
   * 引数を1つ増やしたので create or replace では差し替えられない。
   * 旧シグネチャを落とさないと、同名で引数の違う関数が2つ残る。
   */
  it("旧シグネチャを名指しで落としてから作り直す", () => {
    const code = stripSqlComments(readMigration());

    const dropIndex = code.search(/drop function if exists public\.list_owned_event_ids\(text, text, text, integer, bigint\)/i);
    const createIndex = code.search(/create or replace function public\.list_owned_event_ids/i);

    expect(dropIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeLessThan(createIndex);
  });
});
