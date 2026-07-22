import { NextRequest, NextResponse } from "next/server";

import { buildAvailabilitySlots, monthRangeInTokyo } from "@/lib/domain/group-availability";
import {
  resolveGoogleCalendarAccessToken,
  type CalendarIntegrationRow
} from "@/lib/google-calendar/access-token";
import {
  CalendarFreeBusyError,
  fetchCalendarFreeBusy
} from "@/lib/google-calendar/freebusy";
import {
  getEventCalendarIntegrations,
  type EventCalendarIntegration
} from "@/lib/server/admin/google-token-store";
import { consumeAuthenticatedLimit } from "@/lib/server/rate-limit";
import { requireEventAccess } from "@/lib/server/request-guards";
import { RouteError, toRouteError } from "@/lib/server/route-errors";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const { user } = await requireEventAccess(eventId, "owner");

    const month = request.nextUrl.searchParams.get("month");
    if (!month) {
      throw new RouteError(400, "invalid_month", "month を YYYY-MM 形式で指定してください。");
    }

    let range: ReturnType<typeof monthRangeInTokyo>;
    try {
      range = monthRangeInTokyo(month);
    } catch {
      throw new RouteError(400, "invalid_month", "month を YYYY-MM 形式で指定してください。");
    }

    await consumeAuthenticatedLimit("google_availability");
    let integrationRows: EventCalendarIntegration[];
    try {
      integrationRows = await getEventCalendarIntegrations({
        eventId,
        ownerUserId: user.id
      });
    } catch {
      throw new RouteError(500, "calendar_lookup_failed", "カレンダー連携を確認できませんでした。");
    }

    if (
      integrationRows.length === 0 ||
      integrationRows.some((integration) => !integration.encrypted_refresh_token)
    ) {
      throw new RouteError(
        409,
        "calendar_integration_required",
        "参加者全員の Google カレンダー連携が必要です。"
      );
    }

    let busyByParticipant;
    try {
      busyByParticipant = await Promise.all(
        integrationRows.map(async (integration) => {
          const accessToken = await resolveGoogleCalendarAccessToken({
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
    } catch (error) {
      if (
        error instanceof CalendarFreeBusyError &&
        (error.status === 401 || error.status === 403)
      ) {
        throw new RouteError(
          409,
          "calendar_reconnect_required",
          "Google カレンダーの再連携が必要です。"
        );
      }
      throw new RouteError(
        502,
        "calendar_fetch_failed",
        "空き状況を取得できませんでした。時間をおいて再試行してください。"
      );
    }

    const slots = buildAvailabilitySlots({
      participantCount: integrationRows.length,
      busyByParticipant,
      range
    });

    return NextResponse.json(
      {
        month,
        updatedAt: new Date().toISOString(),
        participantCount: integrationRows.length,
        slots
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return toRouteError(error);
  }
}
