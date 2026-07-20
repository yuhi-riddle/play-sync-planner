import type { EventMessage } from "@/lib/domain/event-chat";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type EventRow = {
  id: string;
  owner_user_id: string;
  title: string;
  category: string;
  status: string;
  location_name: string | null;
  url: string | null;
  memo: string | null;
};

type EventPlan = {
  id: string;
  title: string | null;
  status: string;
  confirmed_start_at: string | null;
  answer_deadline_at: string | null;
};

type Invite = {
  token: string;
  status: "open" | "closed" | "revoked";
};

type EventMemberRow = {
  user_id: string;
  display_name: string;
};

type EventMessageRow = {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

type InitialChat = {
  isJoined: boolean;
  messages: EventMessage[];
  nextCursor: string | null;
  error: string | null;
};

type EventDetailSupabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type EventDetailData = {
  event: EventRow;
  isOwner: boolean;
  memberCount: number;
  invite: Invite | null;
  nearestPlan: EventPlan | null;
  chat: InitialChat;
};

function mapMessage(row: EventMessageRow, names: ReadonlyMap<string, string>, currentUserId: string): EventMessage {
  return {
    id: row.id,
    authorName: names.get(row.author_user_id) ?? "参加者",
    body: row.body,
    createdAt: row.created_at,
    isOwn: row.author_user_id === currentUserId
  };
}

async function loadInitialChat(supabase: EventDetailSupabase, eventId: string, currentUserId: string): Promise<Omit<InitialChat, "isJoined" | "error">> {
  const { data: messageData, error: messagesError } = await supabase
    .from("event_messages")
    .select("id, author_user_id, body, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(51);
  if (messagesError) throw new Error("Chat query failed");

  const rows = (messageData ?? []) as EventMessageRow[];
  const visibleRows = rows.slice(0, 50);
  const authorIds = [...new Set(visibleRows.map((message) => message.author_user_id))];
  const { data: memberData, error: membersError } = authorIds.length
    ? await supabase
        .from("event_members")
        .select("user_id, display_name")
        .eq("event_id", eventId)
        .in("user_id", authorIds)
        .limit(50)
    : { data: [], error: null };
  if (membersError) throw new Error("Chat members query failed");

  const names = new Map((memberData ?? []).map((member) => {
    const typedMember = member as EventMemberRow;
    return [typedMember.user_id, typedMember.display_name] as const;
  }));
  const lastRow = visibleRows.at(-1);
  return {
    messages: visibleRows.reverse().map((message) => mapMessage(message, names, currentUserId)),
    nextCursor: rows.length > 50 && lastRow
      ? Buffer.from(JSON.stringify({ createdAt: lastRow.created_at, id: lastRow.id })).toString("base64url")
      : null
  };
}

export async function loadEventDetailData({
  supabase,
  eventId,
  currentUserId
}: {
  supabase: EventDetailSupabase;
  eventId: string;
  currentUserId: string | null;
}): Promise<EventDetailData | null> {
  const { data: eventData, error: eventError } = await supabase
    .from("events")
    .select("id, owner_user_id, title, category, status, location_name, url, memo")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventData as EventRow | null;
  if (eventError || !event) return null;

  const isOwner = currentUserId === event.owner_user_id;
  const { data: membership, error: membershipError } = currentUserId
    ? await supabase
        .from("event_members")
        .select("user_id")
        .eq("event_id", eventId)
        .eq("user_id", currentUserId)
        .eq("status", "joined")
        .maybeSingle()
    : { data: null, error: null };
  const isJoined = Boolean(currentUserId && membership && !membershipError);

  const memberCountPromise = supabase
    .from("event_members")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "joined");
  const nearestPlanPromise = supabase
    .from("plans")
    .select("id, title, status, confirmed_start_at, answer_deadline_at")
    .eq("event_id", eventId)
    .order("answer_deadline_at", { ascending: true, nullsFirst: false })
    .limit(1);
  const invitePromise = isOwner
    ? supabase
        .from("event_invite_links")
        .select("token, status")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const [memberCountResult, nearestPlanResult, inviteResult] = await Promise.all([memberCountPromise, nearestPlanPromise, invitePromise]);
  const chat: InitialChat = currentUserId && membershipError
    ? { isJoined: false, messages: [], nextCursor: null, error: "チャットを読み込めませんでした。再試行してください。" }
    : isJoined && currentUserId
      ? await loadInitialChat(supabase, eventId, currentUserId)
        .then((result) => ({ isJoined: true, error: null, ...result }))
        .catch(() => ({ isJoined: true, messages: [], nextCursor: null, error: "チャットを読み込めませんでした。再試行してください。" }))
      : { isJoined: false, messages: [], nextCursor: null, error: null };

  return {
    event,
    isOwner,
    memberCount: memberCountResult.error ? 0 : memberCountResult.count ?? 0,
    invite: inviteResult.error ? null : (inviteResult.data as Invite | null),
    nearestPlan: nearestPlanResult.error ? null : ((nearestPlanResult.data ?? [])[0] as EventPlan | undefined) ?? null,
    chat
  };
}
