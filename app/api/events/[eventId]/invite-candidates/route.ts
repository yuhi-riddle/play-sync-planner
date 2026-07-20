import { NextRequest, NextResponse } from "next/server";

import type { ConnectionCandidate } from "@/lib/domain/connections";
import {
  encodeConnectionCursor,
  eventIdSchema,
  eventInviteCandidateQuerySchema,
  parseConnectionCursor
} from "@/lib/validation/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
const pageSize = 20;

type CandidateRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  latest_shared_at: string | null;
  is_following: boolean;
  is_followed_by: boolean;
  is_favorite: boolean;
  cursor_at: string;
  cursor_user_id: string;
};

export type InviteCandidatePage = { items: ConnectionCandidate[]; nextCursor: string | null };

function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers });
}

function toCandidate(row: CandidateRow): ConnectionCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    latestSharedAt: row.latest_shared_at ?? "",
    isFollowing: row.is_following,
    isFollowedBy: row.is_followed_by,
    isFavorite: row.is_favorite
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const parsedEventId = eventIdSchema.safeParse(rawEventId);
  const parsedQuery = eventInviteCandidateQuerySchema.safeParse(request.nextUrl.searchParams.get("q") ?? "");
  if (!parsedEventId.success || !parsedQuery.success) return apiError(400, "招待候補の指定が正しくありません。");

  let cursor;
  try {
    cursor = parseConnectionCursor(request.nextUrl.searchParams.get("cursor"));
  } catch {
    return apiError(400, "招待候補の続き位置が正しくありません。");
  }

  const eventId = parsedEventId.data;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "ログインが必要です。");

    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("id")
      .eq("id", eventId)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    if (eventError) return apiError(500, "招待候補を読み込めませんでした。");
    if (!event) return apiError(403, "このイベントの招待候補は表示できません。");

    const { data, error } = await supabase.rpc("list_event_invite_candidates", {
      p_event_id: eventId,
      p_query: parsedQuery.data,
      p_cursor_at: cursor?.cursorAt ?? null,
      p_cursor_user_id: cursor?.cursorUserId ?? null,
      p_limit: pageSize
    });
    if (error) return apiError(500, "招待候補を読み込めませんでした。");

    const rows = (data ?? []) as CandidateRow[];
    const lastRow = rows.length === pageSize ? rows.at(-1) : undefined;
    const page: InviteCandidatePage = {
      items: rows.map(toCandidate),
      nextCursor: lastRow
        ? encodeConnectionCursor({ cursorAt: lastRow.cursor_at, cursorUserId: lastRow.cursor_user_id })
        : null
    };
    return NextResponse.json(page, { headers });
  } catch {
    return apiError(500, "招待候補を読み込めませんでした。");
  }
}
