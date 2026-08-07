export const EVENT_DETAIL_TABS = ["overview", "members", "chat", "tasks"] as const;

export type EventDetailTab = (typeof EVENT_DETAIL_TABS)[number];

export const EVENT_DETAIL_TAB_LABELS: Record<EventDetailTab, string> = {
  overview: "概要",
  members: "参加者",
  chat: "チャット",
  tasks: "タスク"
};

export function normalizeEventDetailTab(value: string | string[] | undefined): EventDetailTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return EVENT_DETAIL_TABS.includes(candidate as EventDetailTab) ? (candidate as EventDetailTab) : "overview";
}

/**
 * 開いているタブに応じて、追加で取得すべきデータを決める。
 * イベント本体・参加人数・招待リンク・参加者かどうかの判定は常に必要なのでここには含めない。
 */
export function resolveEventDetailDataNeeds(
  tab: EventDetailTab,
  isOwner: boolean
): { needsInviteCandidates: boolean; needsChatMessages: boolean; needsTasks: boolean } {
  return {
    needsInviteCandidates: tab === "members" && isOwner,
    needsChatMessages: tab === "chat",
    needsTasks: tab === "tasks"
  };
}
