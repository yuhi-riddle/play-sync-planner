import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(path.join(process.cwd(), "app/events/[eventId]/page.tsx"), "utf8");

describe("イベント詳細ページのタブ構成", () => {
  it("searchParams からタブを受け取る", () => {
    expect(source).toContain("searchParams");
    expect(source).toContain("normalizeEventDetailTab");
  });

  it("タブバーを描画する", () => {
    expect(source).toContain("<EventDetailTabs");
  });

  it("進行状況の要約をヘッダーに出す", () => {
    expect(source).toContain("resolveEventProgress");
  });

  it("チャットとタスクはそれぞれのタブでのみ描画する", () => {
    expect(source).toMatch(/tab === "chat"[\s\S]*<EventChat/);
    expect(source).toMatch(/tab === "tasks"[\s\S]*<EventTaskList/);
  });

  it("招待まわりは参加者タブでのみ描画する", () => {
    expect(source).toMatch(/tab === "members"[\s\S]*<EventMemberInviteCard/);
    expect(source).toMatch(/tab === "members"[\s\S]*<EventInviteCandidates/);
  });

  it("日程調整の一覧は概要タブに置く", () => {
    expect(source).toMatch(/tab === "overview"[\s\S]*日程調整/);
  });
});
