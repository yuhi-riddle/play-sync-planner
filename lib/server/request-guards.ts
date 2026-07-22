import type { User } from "@supabase/supabase-js";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const publicTokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type EventAccessRole = "owner" | "joined" | "owner-or-joined";
export type SessionSupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type EventAccess = {
  user: User;
  supabase: SessionSupabaseClient;
  event: {
    id: string;
    ownerUserId: string;
  };
  membership: {
    role: string;
    status: string;
  } | null;
  isOwner: boolean;
  isJoined: boolean;
};

type GuardStatus = 400 | 401 | 403 | 500;

export class RequestGuardError extends Error {
  readonly status: GuardStatus;
  readonly code: string;

  constructor(status: GuardStatus, code: string, message: string) {
    super(message);
    this.name = "RequestGuardError";
    this.status = status;
    this.code = code;
  }
}

export function requireUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    throw new RequestGuardError(
      400,
      "invalid_request",
      "リクエストの指定が正しくありません。"
    );
  }

  return parsed.data;
}

export function normalizePublicToken(token: string): string {
  const normalized = token.trim().toLowerCase();
  if (!publicTokenPattern.test(normalized)) {
    throw new RequestGuardError(
      400,
      "invalid_request",
      "共有リンクが正しくありません。"
    );
  }

  return normalized;
}

export async function requireUser(): Promise<{
  user: User;
  supabase: SessionSupabaseClient;
}> {
  let supabase: SessionSupabaseClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    throw new RequestGuardError(
      500,
      "authentication_check_failed",
      "認証状態を確認できませんでした。"
    );
  }

  let user: User | null;
  let error: unknown;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch {
    throw new RequestGuardError(
      500,
      "authentication_check_failed",
      "認証状態を確認できませんでした。"
    );
  }

  if (error || !user) {
    throw new RequestGuardError(
      401,
      "authentication_required",
      "ログインが必要です。"
    );
  }

  return { user, supabase };
}

export async function requireEventAccess(
  eventId: string,
  role: EventAccessRole
): Promise<EventAccess> {
  const validatedEventId = requireUuid(eventId);
  const { user, supabase } = await requireUser();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("id, owner_user_id")
    .eq("id", validatedEventId)
    .maybeSingle();

  if (eventError) {
    throw new RequestGuardError(
      500,
      "access_check_failed",
      "イベントの権限を確認できませんでした。"
    );
  }

  if (!event) {
    throw new RequestGuardError(
      403,
      "event_access_denied",
      "このイベントを操作する権限がありません。"
    );
  }

  const isOwner = event.owner_user_id === user.id;
  let membership: EventAccess["membership"] = null;

  if (role === "joined" || (role === "owner-or-joined" && !isOwner)) {
    const { data, error } = await supabase
      .from("event_members")
      .select("role, status")
      .eq("event_id", validatedEventId)
      .eq("user_id", user.id)
      .eq("status", "joined")
      .maybeSingle();

    if (error) {
      throw new RequestGuardError(
        500,
        "access_check_failed",
        "イベントの権限を確認できませんでした。"
      );
    }
    membership = data;
  }

  const isJoined = membership?.status === "joined";
  const allowed =
    role === "owner"
      ? isOwner
      : role === "joined"
        ? isJoined
        : isOwner || isJoined;

  if (!allowed) {
    throw new RequestGuardError(
      403,
      "event_access_denied",
      "このイベントを操作する権限がありません。"
    );
  }

  return {
    user,
    supabase,
    event: {
      id: event.id,
      ownerUserId: event.owner_user_id
    },
    membership,
    isOwner,
    isJoined
  };
}
