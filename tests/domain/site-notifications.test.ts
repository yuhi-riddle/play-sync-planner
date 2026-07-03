import { describe, expect, it } from "vitest";

import {
  buildNotificationCandidate,
  filterNotificationsByReadState,
  onlyUnreadNotifications,
  summarizeUnreadNotifications,
  type NotificationCandidate
} from "@/lib/domain/site-notifications";

describe("buildNotificationCandidate", () => {
  it("builds a stable answer deadline notification", () => {
    expect(
      buildNotificationCandidate({
        userId: "user-1",
        kind: "answer_deadline",
        planId: "plan-1",
        title: "謎解き公演 / 土曜夜",
        href: "/plans/plan-1",
        dueAt: "2026-07-10T12:00:00Z"
      })
    ).toEqual({
      userId: "user-1",
      kind: "answer_deadline",
      title: "回答期限が近づいています",
      body: "謎解き公演 / 土曜夜 の回答期限を確認してください。",
      href: "/plans/plan-1",
      dedupeKey: "answer_deadline:plan-1:2026-07-10T12:00:00Z"
    });
  });

  it("builds a payment due notification with participant names", () => {
    expect(
      buildNotificationCandidate({
        userId: "user-1",
        kind: "payment_due",
        planId: "plan-1",
        title: "ボドゲ会",
        href: "/plans/plan-1/settlement",
        participantNames: ["田中", "佐藤"]
      })
    ).toEqual({
      userId: "user-1",
      kind: "payment_due",
      title: "支払い待ちがあります",
      body: "ボドゲ会 で 田中さん、佐藤さん の支払い待ちがあります。",
      href: "/plans/plan-1/settlement",
      dedupeKey: "payment_due:plan-1:田中|佐藤"
    });
  });
});

describe("summarizeUnreadNotifications", () => {
  it("counts unread notifications and returns the latest items first", () => {
    const notifications: NotificationCandidate[] = [
      {
        userId: "user-1",
        kind: "unanswered",
        title: "古い通知",
        body: "body",
        href: "/plans/old",
        dedupeKey: "old",
        createdAt: "2026-07-01T00:00:00Z"
      },
      {
        userId: "user-1",
        kind: "payment_due",
        title: "新しい通知",
        body: "body",
        href: "/plans/new",
        dedupeKey: "new",
        createdAt: "2026-07-02T00:00:00Z"
      }
    ];

    expect(summarizeUnreadNotifications(notifications, 1)).toEqual({
      unreadCount: 2,
      latest: [notifications[1]]
    });
  });
});

describe("onlyUnreadNotifications", () => {
  it("keeps only notifications without read_at", () => {
    expect(
      onlyUnreadNotifications([
        { id: "unread", read_at: null },
        { id: "read", read_at: "2026-07-03T00:00:00Z" }
      ])
    ).toEqual([{ id: "unread", read_at: null }]);
  });
});

describe("filterNotificationsByReadState", () => {
  const notifications = [
    { id: "unread", read_at: null },
    { id: "read", read_at: "2026-07-03T00:00:00Z" },
    { id: "camel-unread", readAt: null },
    { id: "camel-read", readAt: "2026-07-03T00:00:00Z" }
  ];

  it("keeps unread notifications when the unread filter is selected", () => {
    expect(filterNotificationsByReadState(notifications, "unread").map((notification) => notification.id)).toEqual([
      "unread",
      "camel-unread"
    ]);
  });

  it("keeps read notifications when the read filter is selected", () => {
    expect(filterNotificationsByReadState(notifications, "read").map((notification) => notification.id)).toEqual([
      "read",
      "camel-read"
    ]);
  });
});
