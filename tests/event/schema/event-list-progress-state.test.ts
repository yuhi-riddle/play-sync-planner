import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/047_event_list_progress_state_filter.sql"
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

/** SQL の -- コメントを取り除いた本文。コメント内の偽装で assertion をすり抜けさせない。 */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("event list progress-state filter migration", () => {
  it("旧6引数シグネチャを drop してから7引数で作り直す", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(
      /drop function if exists public\.list_owned_event_ids\(text, text, text, integer, bigint, text\)/i
    );
    expect(code).toMatch(/p_display_state text default 'all'/);
  });

  it("display_state の CASE が getEventDisplayState と同じ順序の7分岐を持つ", () => {
    const code = stripSqlComments(readMigration());
    // display_state を出す CASE だけを取る（normalized の display_state_value の CASE を巻き込まないよう
    // 最初の when 節で anchor する）。
    const caseMatch = code.match(
      /case\s+when es\.lifecycle_finished and es\.settlement_state[\s\S]*?end as display_state/i
    );
    expect(caseMatch, "display_state を組み立てる CASE が見つからない").not.toBeNull();

    const expr = caseMatch![0];
    const order = [
      "settlement_waiting",
      "cancelled",
      "completed",
      "answer_waiting",
      "event_waiting",
      "participant_waiting",
      "schedule_creation_waiting"
    ];
    const positions = order.map((state) => expr.indexOf(`'${state}'`));
    positions.forEach((pos, index) => {
      expect(pos, `${order[index]} が CASE に無い`).toBeGreaterThanOrEqual(0);
    });
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions, "CASE の分岐順序が getEventDisplayState と違う").toEqual(sorted);
  });

  it("進行状態の判定に必要な集約がある", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toContain("as has_collecting_answers");
    expect(code).toContain("as has_upcoming_confirmed");
    // has_upcoming_confirmed は「未来の確定開始」で判定する
    expect(code).toMatch(/confirmed_start_at is not null[\s\S]*?confirmed_start_at > now\(\)/);
  });

  it("p_display_state で filtered を絞る（受けるのは進行中の内訳5つだけ）", () => {
    const code = stripSqlComments(readMigration());
    expect(code).toMatch(/display_state_value = 'all' or [\w.]+\.display_state = [\w.]+\.display_state_value/);

    const inputMatch = code.match(/p_display_state in \(([\s\S]*?)\)\s+then p_display_state/i);
    expect(inputMatch, "p_display_state を検証する in 句が見つからない").not.toBeNull();
    const inputList = inputMatch![1];
    for (const state of [
      "participant_waiting",
      "schedule_creation_waiting",
      "answer_waiting",
      "event_waiting",
      "settlement_waiting"
    ]) {
      expect(inputList, `${state} を受けていない`).toContain(`'${state}'`);
    }
    // completed / cancelled は p_filter 側の担当。ここでは受けない
    expect(inputList).not.toContain("'completed'");
    expect(inputList).not.toContain("'cancelled'");
  });

  it("7引数シグネチャに grant / revoke を張り直す", () => {
    const code = stripSqlComments(readMigration());
    const sig = "public.list_owned_event_ids(text, text, text, integer, bigint, text, text)";
    expect(code).toContain(`revoke all on function ${sig} from public`);
    expect(code).toContain(`revoke all on function ${sig} from anon`);
    expect(code).toContain(`grant execute on function ${sig} to authenticated`);
  });
});
