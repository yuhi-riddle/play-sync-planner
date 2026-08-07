import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "app/events/[eventId]/page.tsx"), "utf8");

describe("イベント詳細ページのデータ取得", () => {
  it("タブごとの必要データ判定を使う", () => {
    expect(source).toContain("resolveEventDetailDataNeeds");
  });

  it("参加判定とメッセージ取得が別の関数に分かれている", () => {
    expect(source).toContain("async function loadEventMembership");
    expect(source).toContain("async function loadEventChatMessages");
  });

  // 分割前は loadEventChat が参加判定とメッセージ取得を必ずまとめて実行していた。
  // 概要タブでメッセージを取りに行かないことが、このタスクの目的そのもの。
  it("参加判定とメッセージ取得をまとめて行う関数が残っていない", () => {
    expect(source).not.toContain("async function loadEventChat(");
  });

  it("メッセージ・タスク・招待候補は必要判定を通してから取得する", () => {
    expect(source).toMatch(/needsChatMessages\s*(&&|\?)/);
    expect(source).toMatch(/needsTasks\s*(&&|\?)/);
    expect(source).toMatch(/needsInviteCandidates\s*(&&|\?)/);
  });
});
