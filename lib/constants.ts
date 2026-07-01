export const EVENT_CATEGORIES = [
  "live",
  "travel",
  "drinking",
  "nazotoki",
  "snowboard",
  "boardgame",
  "movie_stage",
  "other"
] as const;

export const EVENT_STATUSES = [
  "interested",
  "planning",
  "confirmed",
  "done",
  "cancelled",
  "skipped"
] as const;

export const PLAN_STATUSES = [
  "draft",
  "collecting_answers",
  "date_confirmed",
  "ticket_purchased",
  "settling",
  "settled",
  "participated",
  "cancelled",
  "skipped"
] as const;

export const PARTICIPANT_STATUSES = [
  "invited",
  "answered",
  "confirmed",
  "waitlisted",
  "declined",
  "cancelled"
] as const;

export const AVAILABILITY_ANSWERS = ["yes", "maybe", "no", "unanswered"] as const;

export const SHARE_LINK_PURPOSES = ["answer", "summary", "settlement", "payment_request"] as const;

export const categoryLabels: Record<(typeof EVENT_CATEGORIES)[number], string> = {
  nazotoki: "謎解き",
  live: "ライブ",
  travel: "旅行",
  drinking: "飲み会",
  snowboard: "スノボ",
  boardgame: "ボードゲーム",
  movie_stage: "映画・舞台",
  other: "その他"
};

export const eventStatusLabels: Record<(typeof EVENT_STATUSES)[number], string> = {
  interested: "気になる",
  planning: "調整中",
  confirmed: "確定",
  done: "完了",
  cancelled: "中止",
  skipped: "見送り"
};

export const planStatusLabels: Record<(typeof PLAN_STATUSES)[number], string> = {
  draft: "下書き",
  collecting_answers: "回答受付中",
  date_confirmed: "日程確定",
  ticket_purchased: "チケット購入済み",
  settling: "清算中",
  settled: "清算済み",
  participated: "参加済み",
  cancelled: "中止",
  skipped: "見送り"
};
