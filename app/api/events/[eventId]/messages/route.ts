import { NextRequest, NextResponse } from "next/server";

import type { EventMessage } from "@/lib/domain/event-chat";
import {
  encodeEventMessageCursor,
  eventIdSchema,
  parseEventMessageCursor
} from "@/lib/validation/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
const pageSize = 50;

type EventRow = { id: string; owner_user_id: string };
type EventMemberRow = { user_id: string; display_name: string };
type EventMessageRow = { id: string; author_user_id: string; body: string; created_at: string };

export type MessagePage = { items: EventMessage[]; nextCursor: string | null };

function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers });
}

function messageFor(row: EventMessageRow, names: ReadonlyMap<string, string>, currentUserId: string): EventMessage {
  return {
    id: row.id,
    authorName: names.get(row.author_user_id) ?? "参加者",
    body: row.body,
    createdAt: row.created_at,
    isOwn: row.author_user_id === currentUserId
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: rawEventId } = await params;
  const parsedEventId = eventIdSchema.safeParse(rawEventId);
  if (!parsedEventId.success) return apiError(400, "イベントの指定が正しくありません。");

  let cursor;
  try {
    cursor = parseEventMessageCursor(request.nextUrl.searchParams.get("cursor"));
  } catch {
    return apiError(400, "メッセージの続き位置が正しくありません。");
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
      .select("id, owner_user_id")
      .eq("id", eventId)
      .maybeSingle();
    const typedEvent = event as EventRow | null;
    if (eventError) return apiError(500, "メッセージを読み込めませんでした。");
    if (!typedEvent) return apiError(403, "このイベントのチャットは閲覧できません。");

    if (typedEvent.owner_user_id !== user.id) {
      const { data: membership, error: membershipError } = await supabase
        .from("event_members")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .eq("status", "joined")
        .maybeSingle();
      if (membershipError) return apiError(500, "メッセージを読み込めませんでした。");
      if (!membership) return apiError(403, "このイベントのチャットは閲覧できません。");
    }

    let messageQuery = supabase
      .from("event_messages")
      .select("id, author_user_id, body, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });
    if (cursor) {
      messageQuery = messageQuery.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const { data: messageData, error: messagesError } = await messageQuery.limit(pageSize + 1);
    if (messagesError) return apiError(500, "メッセージを読み込めませんでした。");

    const rows = (messageData ?? []) as EventMessageRow[];
    const visibleRows = rows.slice(0, pageSize);
    const authorIds = [...new Set(visibleRows.map((message) => message.author_user_id))];
    const { data: members, error: membersError } = authorIds.length
      ? await supabase
          .from("event_members")
          .select("user_id, display_name")
          .eq("event_id", eventId)
          .in("user_id", authorIds)
          .limit(pageSize)
      : { data: [], error: null };
    if (membersError) return apiError(500, "メッセージを読み込めませんでした。");

    const names = new Map((members ?? []).map((member) => {
      const typedMember = member as EventMemberRow;
      return [typedMember.user_id, typedMember.display_name] as const;
    }));
    const lastRow = visibleRows.at(-1);
    const page: MessagePage = {
      items: visibleRows.reverse().map((row) => messageFor(row, names, user.id)),
      nextCursor: rows.length > pageSize && lastRow ? encodeEventMessageCursor({ createdAt: lastRow.created_at, id: lastRow.id }) : null
    };
    return NextResponse.json(page, { headers });
  } catch {
    return apiError(500, "メッセージを読み込めませんでした。");
  }
}
