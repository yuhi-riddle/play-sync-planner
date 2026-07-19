import { NextRequest, NextResponse } from "next/server";

import type { ConnectionCandidate } from "@/lib/domain/connections";
import {
  connectionCategorySchema,
  encodeConnectionCursor,
  parseConnectionCursor,
  type ConnectionCategory
} from "@/lib/validation/request";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const headers = { "Cache-Control": "private, no-store" };
const pageSize = 20;

type ConnectionRow = {
  user_id: string;
  display_name: string;
  shared_event_count: number | string;
  latest_shared_at: string;
  is_following: boolean;
  is_followed_by: boolean;
  is_favorite: boolean;
  cursor_at: string;
  cursor_user_id: string;
};

export type ConnectionPage = { items: ConnectionCandidate[]; nextCursor: string | null };

function apiError(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers });
}

function toCandidate(row: ConnectionRow): ConnectionCandidate {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    sharedEventCount: Number(row.shared_event_count),
    latestSharedAt: row.latest_shared_at,
    isFollowing: row.is_following,
    isFollowedBy: row.is_followed_by,
    isFavorite: row.is_favorite
  };
}

function validCategory(value: string | null): ConnectionCategory | null {
  const parsed = connectionCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function GET(request: NextRequest) {
  const category = validCategory(request.nextUrl.searchParams.get("category"));
  if (!category) return apiError(400, "リクエストが正しくありません。");

  let cursor;
  try {
    cursor = parseConnectionCursor(request.nextUrl.searchParams.get("cursor"));
  } catch {
    return apiError(400, "リクエストが正しくありません。");
  }

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return apiError(401, "ログインが必要です。");

    const { data, error } = await supabase.rpc("list_connections", {
      p_category: category,
      p_cursor_at: cursor?.cursorAt ?? null,
      p_cursor_user_id: cursor?.cursorUserId ?? null,
      p_limit: pageSize
    });
    if (error) return apiError(500, "つながりを読み込めませんでした。");

    const rows = (data ?? []) as ConnectionRow[];
    const lastRow = rows.length === pageSize ? rows.at(-1) : undefined;
    const page: ConnectionPage = {
      items: rows.map(toCandidate),
      nextCursor: lastRow
        ? encodeConnectionCursor({ cursorAt: lastRow.cursor_at, cursorUserId: lastRow.cursor_user_id })
        : null
    };
    return NextResponse.json(page, { headers });
  } catch {
    return apiError(500, "つながりを読み込めませんでした。");
  }
}
