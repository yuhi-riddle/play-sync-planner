import { NextRequest, NextResponse } from "next/server";

import { monthRangeInTokyo, buildAvailabilitySlots } from "@/lib/domain/group-availability";
import { resolveGoogleCalendarAccessToken, type CalendarIntegrationRow } from "@/lib/google-calendar/access-token";
import { fetchCalendarFreeBusy } from "@/lib/google-calendar/freebusy";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です。" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: membership, error: membershipError } = await supabase
    .from("event_members")
    .select("id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .eq("status", "joined")
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "このイベントの参加者だけが空き状況を確認できます。" }, { status: 403 });
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

  if ((integrations ?? []).length !== memberUserIds.length) {
    return NextResponse.json({ error: "参加者全員の Google Calendar 連携が必要です。" }, { status: 409 });
  }

  try {
    const busyByParticipant = await Promise.all(
      (integrations ?? []).map(async (integration) => {
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
    const slots = buildAvailabilitySlots({
      participantCount: memberUserIds.length,
      busyByParticipant,
      range
    });

    return NextResponse.json({
      month,
      updatedAt: new Date().toISOString(),
      participantCount: memberUserIds.length,
      slots
    });
  } catch {
    return NextResponse.json({ error: "空き状況を取得できませんでした。時間をおいて再試行してください。" }, { status: 502 });
  }
}
