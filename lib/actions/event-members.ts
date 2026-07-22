"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserDisplayName } from "@/lib/domain/profile";
import { rateLimitErrorFromDatabase } from "@/lib/server/rate-limit";
import {
  RequestGuardError,
  requireEventAccess,
  requireUser
} from "@/lib/server/request-guards";

async function requireEventOwner(eventId: string) {
  try {
    return await requireEventAccess(eventId, "owner");
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) redirect("/login");
    throw error;
  }
}

function revalidateEvent(eventId: string) {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath(`/events/${eventId}`);
}

export async function createEventInviteAction(eventId: string) {
  const { supabase, user } = await requireEventOwner(eventId);
  const { error } = await supabase.from("event_invite_links").insert({
    event_id: eventId,
    token: randomUUID(),
    status: "open",
    created_by_user_id: user.id
  });

  if (error) throw new Error("招待リンクを作成できませんでした。");
  revalidateEvent(eventId);
}

export async function closeEventInvitesAction(eventId: string) {
  const { supabase } = await requireEventOwner(eventId);
  const { error } = await supabase
    .from("event_invite_links")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("status", "open");

  if (error) throw new Error("招待リンクを閉じられませんでした。");
  revalidateEvent(eventId);
}

export async function revokeAndCreateEventInviteAction(eventId: string) {
  const { supabase, user } = await requireEventOwner(eventId);
  const { data: currentInvite, error: findError } = await supabase
    .from("event_invite_links")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "open")
    .maybeSingle();

  if (findError) throw new Error("招待リンクを確認できませんでした。");
  if (currentInvite) {
    const { error } = await supabase
      .from("event_invite_links")
      .update({ status: "revoked", closed_at: new Date().toISOString() })
      .eq("id", currentInvite.id);
    if (error) throw new Error("招待リンクを無効にできませんでした。");
  }

  const { error } = await supabase.from("event_invite_links").insert({
    event_id: eventId,
    token: randomUUID(),
    status: "open",
    created_by_user_id: user.id
  });
  if (error) throw new Error("新しい招待リンクを作成できませんでした。");

  revalidateEvent(eventId);
}

export async function joinEventFromInviteAction(token: string) {
  const invitePath = `/invites/${token}`;
  let session: Awaited<ReturnType<typeof requireUser>>;
  try {
    session = await requireUser();
  } catch (error) {
    if (error instanceof RequestGuardError && error.status === 401) {
      redirect(`/login?next=${encodeURIComponent(invitePath)}`);
    }
    throw error;
  }

  const { data: integration, error: integrationError } = await session.supabase
    .from("calendar_integrations")
    .select("id")
    .eq("user_id", session.user.id)
    .eq("provider", "google")
    .maybeSingle();
  if (integrationError) throw new Error("カレンダー連携を確認できませんでした。");
  if (!integration) {
    redirect(`/api/google-calendar/connect?next=${encodeURIComponent(invitePath)}`);
  }

  const { data: eventId, error } = await session.supabase.rpc("join_event_from_invite", {
    p_token: token,
    p_display_name: getUserDisplayName(session.user)
  });

  const rateLimitError = rateLimitErrorFromDatabase(error);
  if (rateLimitError) throw rateLimitError;
  if (error?.code === "42501") throw new Error("この招待リンクは利用できません。");
  if (error?.code === "55000") {
    redirect(`/api/google-calendar/connect?next=${encodeURIComponent(invitePath)}`);
  }
  if (error || !eventId) throw new Error("イベントに参加できませんでした。");

  revalidateEvent(eventId);
  redirect(`/events/${eventId}`);
}
