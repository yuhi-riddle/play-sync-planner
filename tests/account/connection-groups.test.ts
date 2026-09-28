import { describe, expect, it } from "vitest";

import {
  buildEventInviteGroups,
  buildGroupIdsByMember,
  connectionGroupColors,
  connectionGroupDotClass,
  isConnectionGroupColor,
  isUuid,
  mapConnectionGroupEventRow,
  mapConnectionGroupMemberRow,
  mapConnectionGroupRow,
  normalizeConnectionGroupName
} from "@/lib/domain/account/connection-groups";

describe("normalizeConnectionGroupName", () => {
  it("前後の空白を落とす", () => {
    expect(normalizeConnectionGroupName("  謎解き仲間 ")).toEqual({ ok: true, name: "謎解き仲間" });
  });

  it("空と21文字以上は理由つきで弾く", () => {
    expect(normalizeConnectionGroupName("   ")).toEqual({ ok: false, message: "グループ名を入力してください" });
    expect(normalizeConnectionGroupName("あ".repeat(21))).toEqual({
      ok: false,
      message: "グループ名は20文字までです"
    });
    expect(normalizeConnectionGroupName("あ".repeat(20))).toEqual({ ok: true, name: "あ".repeat(20) });
  });
});

describe("colors", () => {
  it("8色すべてに点の色クラスがある", () => {
    expect(connectionGroupColors).toHaveLength(8);
    for (const color of connectionGroupColors) {
      expect(connectionGroupDotClass[color]).toMatch(/^bg-/);
    }
    expect(connectionGroupDotClass.movie_stage).toBe("bg-category-movie-stage");
    expect(connectionGroupDotClass.honey).toBe("bg-honey");
  });

  it("isConnectionGroupColor は8色だけ通す", () => {
    expect(isConnectionGroupColor("nazotoki")).toBe(true);
    expect(isConnectionGroupColor("movie-stage")).toBe(false);
    expect(isConnectionGroupColor("black")).toBe(false);
  });
});

describe("mappers", () => {
  it("RPC の数値文字列を数にし、知らない色は既定色にする", () => {
    expect(
      mapConnectionGroupRow({
        group_id: "g1",
        name: "謎解き仲間",
        color: "unknown",
        member_count: "3",
        member_names: ["あや", "けん", "みお"],
        active_event_count: "2",
        created_at: "2026-09-25T00:00:00Z"
      })
    ).toEqual({ id: "g1", name: "謎解き仲間", color: "nazotoki", memberCount: 3, memberNames: ["あや", "けん", "みお"], activeEventCount: 2 });

    expect(
      mapConnectionGroupMemberRow({ user_id: "u1", display_name: "あや", shared_event_count: "5", is_following: true })
    ).toEqual({ userId: "u1", displayName: "あや", sharedEventCount: 5, isFollowing: true });
  });

  it("イベントの行を変換する", () => {
    expect(
      mapConnectionGroupEventRow({
        event_id: "e1",
        title: "謎解き 秋公演",
        display_state: "answer_waiting",
        is_active: true,
        member_count: "2",
        group_member_count: "3"
      })
    ).toEqual({
      eventId: "e1",
      title: "謎解き 秋公演",
      displayState: "answer_waiting",
      isActive: true,
      memberCount: 2,
      groupMemberCount: 3
    });
  });

  it("buildGroupIdsByMember は人ごとに所属グループの ID をまとめる", () => {
    expect(
      buildGroupIdsByMember([
        { group_id: "a", member_user_id: "u1" },
        { group_id: "b", member_user_id: "u1" },
        { group_id: "a", member_user_id: "u2" }
      ])
    ).toEqual({ u1: ["a", "b"], u2: ["a"] });
  });
});

describe("isUuid", () => {
  it("UUID だけ通す", () => {
    expect(isUuid("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});

describe("buildEventInviteGroups", () => {
  it("グループごとにまとめ、招待できる人を候補の形にする。null の行は招待できる人なし", () => {
    expect(
      buildEventInviteGroups([
        { group_id: "g1", group_name: "謎解き仲間", group_color: "nazotoki", group_member_count: "2", user_id: "u1", display_name: "あや", shared_event_count: "3", is_following: true },
        { group_id: "g1", group_name: "謎解き仲間", group_color: "nazotoki", group_member_count: "2", user_id: "u2", display_name: "けん", shared_event_count: "0", is_following: true },
        { group_id: "g2", group_name: "大学の友達", group_color: "unknown", group_member_count: "1", user_id: null, display_name: null, shared_event_count: null, is_following: null }
      ])
    ).toEqual([
      {
        id: "g1",
        name: "謎解き仲間",
        color: "nazotoki",
        memberCount: 2,
        invitees: [
          { userId: "u1", displayName: "あや", sharedEventCount: 3, activeSharedEventCount: 0, latestSharedAt: "", isFollowing: true, isFollowedBy: false, isFavorite: false },
          { userId: "u2", displayName: "けん", sharedEventCount: 0, activeSharedEventCount: 0, latestSharedAt: "", isFollowing: true, isFollowedBy: false, isFavorite: false }
        ]
      },
      { id: "g2", name: "大学の友達", color: "nazotoki", memberCount: 1, invitees: [] }
    ]);
  });
});
