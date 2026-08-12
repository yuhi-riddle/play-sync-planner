import { NextResponse } from "next/server";

import { buildConfirmedCalendarEvent, buildIcsCalendar } from "@/lib/domain/calendar/calendar-sync";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PlanEvent = { title: string | null; location_name: string | null };

/**
 * 確定した予定を .ics で返す。
 *
 * Googleカレンダー連携は任意にしたので、Googleを使っていない人にも予定を渡す道が要る。
 * 予定詳細と、共有清算ページの両方から同じURLを叩く。どちらも見ているのは参加者本人。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;

  /*
   * 開けない理由は区別せず、全部 404 に寄せる。「参加者ではありません」と
   * 「そんな予定はありません」を区別すると、planId を当てずっぽうに叩いて
   * 存在する予定を探せてしまう。
   */
  if (!hasSupabaseEnv()) {
    return notFoundResponse();
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return notFoundResponse();
  }

  // ログイン中の本人としてDBを読む。migration 030 の参加者RLSが効くので、
  // 参加者でなければ1行も返らない。
  const { data: plan } = await supabase
    .from("plans")
    .select("id, title, confirmed_start_at, confirmed_end_at, is_all_day, events(title, location_name)")
    .eq("id", planId)
    .maybeSingle();

  if (!plan?.confirmed_start_at) {
    return notFoundResponse();
  }

  const event = (Array.isArray(plan.events) ? plan.events[0] : plan.events) as PlanEvent | null;
  const ics = buildIcsCalendar({
    uid: `${plan.id}@madoi`,
    event: buildConfirmedCalendarEvent({
      planTitle: plan.title,
      eventTitle: event?.title,
      locationName: event?.location_name,
      startAt: plan.confirmed_start_at,
      endAt: plan.confirmed_end_at,
      isAllDay: Boolean(plan.is_all_day)
    })
  });

  return new NextResponse(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="madoi-${plan.id}.ics"`,
      "cache-control": "no-store"
    }
  });
}

function notFoundResponse() {
  return new NextResponse("Not Found", { status: 404 });
}
