import { createSupabaseAdminClient } from "@/lib/supabase/server";

export type PublicInviteData = {
  eventId: string;
  status: string;
  eventTitle: string;
};

function validatedToken(token: string) {
  const value = token.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function getPublicInvite(token: string): Promise<PublicInviteData | null> {
  const value = validatedToken(token);
  if (!value) return null;

  const supabase = createSupabaseAdminClient();
  const { data: invite, error } = await supabase
    .from("event_invite_links")
    .select("event_id, status, events(title)")
    .eq("token", value)
    .maybeSingle();
  if (error || !invite) return null;
  const event = Array.isArray(invite.events) ? invite.events[0] : invite.events;

  return {
    eventId: invite.event_id,
    status: invite.status,
    eventTitle: event?.title ?? "このイベント"
  };
}
