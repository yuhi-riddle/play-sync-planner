import { describe, expect, it } from "vitest";

import {
  buildAnswerReceivedNotificationInput,
  buildPlanNotificationInputs,
  buildNotificationCandidate,
  countNotificationsByActionFilter,
  filterNotificationsByActionFilter,
  filterNotificationsByReadState,
  onlyUnreadNotifications,
  resolveNotificationActionFilter,
  summarizeUnreadNotifications,
  type NotificationActionFilter,
  type NotificationCandidate
} from "@/lib/domain/site-notifications";

describe("buildNotificationCandidate", () => {
  it("builds an event message notification without message contents", () => {
    expect(
      buildNotificationCandidate({
        userId: "user-1",
        kind: "event_message",
        planId: "event-1",
        title: "夏のバーベキュー",
        href: "/events/event-1#chat"
      })
    ).toEqual({
      userId: "user-1",
      kind: "event_message",
      title: "イベントに新しいメッセージがあります",
      body: "夏のバーベキューに新しいメッセージがあります。",
      href: "/events/event-1#chat",
      dedupeKey: "event_message:event-1"
    });
  });

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

  it("builds an answer received notification", () => {
    expect(
      buildNotificationCandidate(
        buildAnswerReceivedNotificationInput({
          ownerUserId: "user-1",
          planId: "plan-1",
          title: "ボードゲーム会 / 土曜夜",
          participantId: "participant-1",
          participantName: "鈴木"
        })
      )
    ).toEqual({
      userId: "user-1",
      kind: "answer_received",
      title: "日程回答が届きました",
      body: "ボードゲーム会 / 土曜夜 に鈴木さんが回答しました。",
      href: "/plans/plan-1",
      dedupeKey: "answer_received:plan-1:participant-1"
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

describe("filterNotificationsByActionFilter", () => {
  const notifications = [
    { id: "deadline", kind: "answer_deadline" },
    { id: "unanswered", kind: "unanswered" },
    { id: "settlement", kind: "settlement_needed" },
    { id: "payment", kind: "payment_due" },
    { id: "confirmation", kind: "confirmation_due" },
    { id: "message", kind: "event_message" }
  ];

  it.each<[NotificationActionFilter, string[]]>([
    ["all", ["deadline", "unanswered", "settlement", "payment", "confirmation"]],
    ["deadline", ["deadline"]],
    ["unanswered", ["unanswered"]],
    ["settlement", ["settlement"]],
    ["payment", ["payment"]],
    ["confirmation", ["confirmation"]]
  ])("keeps %s notifications", (filter, expectedIds) => {
    expect(filterNotificationsByActionFilter(notifications, filter).map((notification) => notification.id)).toEqual(
      expectedIds
    );
  });

  it("counts notifications by action filter", () => {
    expect(countNotificationsByActionFilter(notifications)).toEqual({
      all: 5,
      deadline: 1,
      unanswered: 1,
      settlement: 1,
      payment: 1,
      confirmation: 1
    });
  });
});

describe("buildPlanNotificationInputs", () => {
  it("creates answer deadline notifications from multiple reminder offsets", () => {
    const inputs = buildPlanNotificationInputs(
      {
        id: "plan-1",
        owner_user_id: "user-1",
        title: "土曜夜",
        status: "collecting_answers",
        settlement_status: null,
        answer_deadline_at: "2026-07-10T21:00:00+09:00",
        events: { title: "イベント" },
        participants: [{ display_name: "鈴木", status: "invited" }],
        plan_reminder_settings: [{ reminder_offset_minutes: 1440, reminder_offsets_minutes: [1440, 180] }],
        settlements: []
      },
      new Date("2026-07-10T18:30:00+09:00")
    );

    expect(inputs.filter((input) => input.kind === "answer_deadline").map((input) => input.dueAt)).toEqual([
      "2026-07-10T21:00:00+09:00:1440",
      "2026-07-10T21:00:00+09:00:180"
    ]);
  });

  it("does not create answer deadline notifications before the reminder timing", () => {
    const inputs = buildPlanNotificationInputs(
      {
        id: "plan-1",
        owner_user_id: "user-1",
        title: "土曜夜",
        status: "collecting_answers",
        settlement_status: null,
        answer_deadline_at: "2026-07-10T21:00:00+09:00",
        events: { title: "イベント" },
        participants: [],
        plan_reminder_settings: [{ reminder_offset_minutes: null, reminder_offsets_minutes: [180] }],
        settlements: []
      },
      new Date("2026-07-10T17:59:00+09:00")
    );

    expect(inputs.filter((input) => input.kind === "answer_deadline")).toHaveLength(0);
  });
});

describe("resolveNotificationActionFilter", () => {
  const counts = {
    all: 2,
    deadline: 1,
    unanswered: 1,
    settlement: 0,
    payment: 0,
    confirmation: 0
  };

  it("falls back to all when the requested filter has no notifications", () => {
    expect(resolveNotificationActionFilter("payment", counts)).toBe("all");
  });

  it("keeps a requested filter that still has notifications", () => {
    expect(resolveNotificationActionFilter("deadline", counts)).toBe("deadline");
  });
});
