import { NextRequest, NextResponse } from "next/server";

import { monthRangeInTokyo, buildDailyBusySummaries } from "@/lib/domain/plan/group-availability";
import { canReadGroupAvailability } from "@/lib/domain/calendar/calendar-availability-access";
import { resolveGoogleCalendarAccessToken, type CalendarIntegrationRow } from "@/lib/google-calendar/access-token";
import { CalendarFreeBusyError, fetchCalendarFreeBusy } from "@/lib/google-calendar/freebusy";
import { createSupabaseAdminClient, getCurrentActiveUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await getCurrentActiveUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const month = request.nextUrl.searchParams.get("month");
  if (!month) {
    return NextResponse.json({ error: "month を YYYY-MM 形式で指定してください。" }, { status: 400 });
  }

  let range: ReturnType<typeof monthRangeInTokyo>;
  try {
    range = monthRangeInTokyo(month);
  } catch {
    return NextResponse.json({ error: "month を YYYY-MM 形式で指定してください。" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("owner_user_id, status")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !canReadGroupAvailability({ eventStatus: event?.status, isOwner: event?.owner_user_id === user.id })) {
    return NextResponse.json({ error: "日程調整中の主催者だけが空き状況を集計できます。" }, { status: 403 });
  }

  const { data: members, error: membersError } = await admin
    .from("event_members")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("status", "joined");

  if (membersError) {
    return NextResponse.json({ error: "参加者を取得できませんでした。" }, { status: 500 });
  }

  const memberUserIds = [...new Set((members ?? []).map((member) => member.user_id))];
  const { data: integrations, error: integrationsError } = await admin
    .from("calendar_integrations")
    .select("user_id, calendar_id, encrypted_access_token, encrypted_refresh_token, token_expires_at")
    .eq("provider", "google")
    .in("user_id", memberUserIds);

  if (integrationsError) {
    return NextResponse.json({ error: "Google Calendar 連携を確認できませんでした。" }, { status: 500 });
  }

  /*
   * 全員の連携は求めない。Googleカレンダーを使っていない人もイベントには入れる。
   * ただし集計の母数は「連携している人数」に固定する。ここを参加者総数のままにすると、
   * 連携していない人が busy に現れないぶん、そのまま「空いている」として数えてしまう。
   */
  const connectedIntegrations = integrations ?? [];
  const connectedCount = connectedIntegrations.length;
  const memberCount = memberUserIds.length;

  if (connectedCount === 0) {
    return NextResponse.json({
      month,
      updatedAt: new Date().toISOString(),
      connectedCount,
      memberCount,
      dailyBusySummaries: {}
    });
  }

  // 1人のトークン失効やAPI障害で全員分を落とさないよう、allSettled で部分成功を許可する。
  const results = await Promise.allSettled(
    connectedIntegrations.map(async (integration) => {
      const accessToken = await resolveGoogleCalendarAccessToken({
        supabase: admin,
        userId: integration.user_id,
        integration: integration as CalendarIntegrationRow
      });
      return fetchCalendarFreeBusy({
        accessToken,
        calendarId: integration.calendar_id ?? "primary",
        timeMin: range.start,
        timeMax: range.end
      });
    })
  );

  const busyByParticipant: Awaited<ReturnType<typeof fetchCalendarFreeBusy>>[] = [];
  let failedCount = 0;
  // 再連携を促してよいのは「閲覧している本人」の連携が切れているときだけ。
  // 他の参加者の連携状態は本人にしか案内できない。
  let viewerReconnectRequired = false;

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      busyByParticipant.push(result.value);
      return;
    }
    failedCount += 1;
    if (connectedIntegrations[index].user_id === user.id) {
      const reason = result.reason;
      if (reason instanceof CalendarFreeBusyError && (reason.status === 401 || reason.status === 403)) {
        viewerReconnectRequired = true;
      }
    }
  });

  if (busyByParticipant.length === 0) {
    return NextResponse.json(
      {
        error: "空き状況を取得できませんでした。時間をおいて再試行してください。",
        ...(viewerReconnectRequired ? { code: "calendar_reconnect_required" } : {})
      },
      { status: 502 }
    );
  }

  const dailyBusySummaries = buildDailyBusySummaries({ busyByParticipant, range });

  return NextResponse.json({
    month,
    updatedAt: new Date().toISOString(),
    connectedCount,
    memberCount,
    succeededCount: busyByParticipant.length,
    failedCount,
    ...(viewerReconnectRequired ? { code: "calendar_reconnect_required" } : {}),
    dailyBusySummaries
  });
}
