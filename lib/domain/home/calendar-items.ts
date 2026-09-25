import type { HomeCalendarItem } from "@/lib/domain/home/home-calendar";

export type CalendarRpcRow = {
  candidate_id: string | null;
  plan_id: string;
  event_title: string | null;
  plan_title: string | null;
  location_name: string | null;
  start_at: string;
  end_at: string | null;
  is_all_day: boolean | null;
  status: string;
};

export function toCalendarItems(rows: CalendarRpcRow[]): HomeCalendarItem[] {
  return rows.map((row) => {
    const isConfirmed = row.status === "date_confirmed";

    return {
      id: isConfirmed ? `confirmed-${row.plan_id}` : `candidate-${row.candidate_id}`,
      kind: isConfirmed ? "confirmed" : "collecting",
      title: row.event_title?.trim() || "イベント未設定",
      subtitle: row.plan_title?.trim() || "日程調整",
      location: row.location_name?.trim() || null,
      startAt: row.start_at,
      endAt: row.end_at,
      isAllDay: row.is_all_day,
      href: `/plans/${row.plan_id}`
    };
  });
}

