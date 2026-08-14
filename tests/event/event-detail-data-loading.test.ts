import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "app/events/[eventId]/page.tsx"), "utf8");

describe("イベント詳細ページのデータ取得", () => {
  it("参加判定とメッセージ取得が別の関数に分かれている", () => {
    expect(source).toContain("async function loadEventMembership");
    expect(source).toContain("async function loadEventChatMessages");
  });

  // 分割前は loadEventChat が参加判定とメッセージ取得を必ずまとめて実行していた。
  // 概要タブでメッセージを取りに行かないことが、このタスクの目的そのもの。
  it("参加判定とメッセージ取得をまとめて行う関数が残っていない", () => {
    expect(source).not.toContain("async function loadEventChat(");
  });

  // タブ本体（招待候補・チャット・タスク）はそれぞれ独立した非同期コンポーネントに
  // 切り出し、Suspenseで包む。開いているタブの分だけが実際に評価されるので、
  // 従来の needsX 判定つきPromise.allと同じく他タブのデータは取りに行かない。
  it("開いているタブの本体だけをSuspenseで囲んで、必要なデータだけを取りに行く", () => {
    expect(source).toContain("async function EventMembersInviteCandidates(");
    expect(source).toContain("async function EventChatSection(");
    expect(source).toContain("async function EventTasksSection(");
    expect(source.match(/<Suspense fallback=/g)?.length).toBe(3);
    expect(source).toMatch(/tab === "members"[\s\S]*?<Suspense fallback=\{<InviteCandidatesSkeleton \/>\}>/);
    expect(source).toMatch(/tab === "chat"[\s\S]*?<Suspense fallback=\{<ChatSkeleton \/>\}>/);
    expect(source).toMatch(/tab === "tasks"[\s\S]*?<Suspense fallback=\{<TasksSkeleton \/>\}>/);
  });

  it("resolveEventDetailDataNeedsのタブ判定は使わなくなった(Suspense境界が代わりに担う)", () => {
    expect(source).not.toContain("resolveEventDetailDataNeeds");
  });

  it("ログインしていない場合はチャットタブでフェッチしない", () => {
    expect(source).toMatch(/tab === "chat"\s*\?\s*\(\s*currentUserId\s*\?/);
  });
});
