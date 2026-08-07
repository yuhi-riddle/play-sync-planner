"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getUserDisplayName } from "@/lib/domain/account/profile";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

async function requireEventOwner(eventId: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: event, error } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("owner_user_id", user.id)
    .single();

  if (error || !event) {
    throw new Error("このイベントを管理する権限がありません。");
  }

  return { supabase, user };
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

  if (error) {
    throw new Error(error.message);
  }

  revalidateEvent(eventId);
}

export async function closeEventInvitesAction(eventId: string) {
  const { supabase } = await requireEventOwner(eventId);
  const { error } = await supabase
    .from("event_invite_links")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("status", "open");

  if (error) {
    throw new Error(error.message);
  }

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

  if (findError) {
    throw new Error(findError.message);
  }

  if (currentInvite) {
    const { error: revokeError } = await supabase
      .from("event_invite_links")
      .update({ status: "revoked", closed_at: new Date().toISOString() })
      .eq("id", currentInvite.id);

    if (revokeError) {
      throw new Error(revokeError.message);
    }
  }

  const { error: createError } = await supabase.from("event_invite_links").insert({
    event_id: eventId,
    token: randomUUID(),
    status: "open",
    created_by_user_id: user.id
  });

  if (createError) {
    throw new Error(createError.message);
  }

  revalidateEvent(eventId);
}

export async function joinEventFromInviteAction(token: string) {
  const user = await getCurrentUser();
  const invitePath = `/invites/${token}`;

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(invitePath)}`);
  }

  const admin = createSupabaseAdminClient();
  const { data: invite, error: inviteError } = await admin
    .from("event_invite_links")
    .select("event_id, status")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !invite || invite.status !== "open") {
    throw new Error("この招待リンクは利用できません。");
  }

  /*
   * カレンダー連携は求めない。Googleカレンダーを使っていない人も参加できる。
   * 連携は空き時間を自動で埋めるための近道で、候補日時への回答は手でもできる。
   * 連携への案内は招待ページ側に出す。
   */
  const { error: memberError } = await admin.from("event_members").upsert(
    {
      event_id: invite.event_id,
      user_id: user.id,
      display_name: getUserDisplayName(user),
      role: "member",
      status: "joined"
    },
    { onConflict: "event_id,user_id" }
  );

  if (memberError) {
    throw new Error(memberError.message);
  }

  revalidateEvent(invite.event_id);
  redirect(`/events/${invite.event_id}`);
}
