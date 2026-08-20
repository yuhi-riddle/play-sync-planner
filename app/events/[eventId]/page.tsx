import { CopyPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { EventMemberInviteCard } from "@/components/event/event-member-invite-card";
import { EventInviteCandidates } from "@/components/event/event-invite-candidates";
import { EventCancelAction } from "@/components/event/event-cancel-action";
import { EventChat } from "@/components/event/event-chat";
import { EventDetailTabs } from "@/components/event/event-detail-tabs";
import { GoogleMapsDirectionsLink } from "@/components/ui/google-maps-directions-link";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SecondaryLink, SectionHeading, Skeleton, SubmitButton } from "@/components/ui";
import { closeEventInvitesAction, revokeAndCreateEventInviteAction } from "@/lib/actions/event/event-members";
import { createEventMessageAction } from "@/lib/actions/event/event-messages";
import { createEventUserInvitationsAction, loadEventInviteCandidatesAction } from "@/lib/actions/account/connections";
import { EventTaskList, type EventTaskMember } from "@/components/event/event-task-list";
import {
  createEventTaskAction,
  deleteEventTaskAction,
  toggleEventTaskDoneAction,
  updateEventTaskAssigneeAction
} from "@/lib/actions/event/event-tasks";
import { cancelEventAction, duplicateEventAction } from "@/lib/actions/event/events";
import type { EventTask } from "@/lib/domain/event/event-tasks";
import { categoryLabels, planStatusLabels } from "@/lib/shared/constants";
import { buildEventInviteUrl } from "@/lib/domain/event/event-members";
import { normalizeEventDetailTab } from "@/lib/domain/event/event-tabs";
import { resolveEventProgress } from "@/lib/domain/event/event-progress";
import { canStartDateAdjustment, isTerminalEventStatus } from "@/lib/domain/event/event-adjustment";
import type { EventMessage } from "@/lib/domain/event/event-chat";
import { mapConnectionPage, type ConnectionPage } from "@/lib/domain/account/connections";
import { formatDateTime } from "@/lib/shared/format";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export const dynamic = "force-dynamic";

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

type EventMessageRow = {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
};

type EventTaskRow = {
  id: string;
  title: string;
  assignee_user_id: string | null;
  done_at: string | null;
  sort_order: number;
};

export default async function EventDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<{ tab?: string | string[] }>;
}) {
  const { eventId } = await params;
  const tab = normalizeEventDetailTab((await searchParams)?.tab);
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("*, plans(id, title, status, confirmed_start_at, answer_deadline_at)")
    .eq("id", eventId)
    .single();

  if (!event) {
    notFound();
  }

  const admin = createSupabaseAdminClient();
  const [{ count: memberCount }, { data: invite }, currentUserId] = await Promise.all([
    admin.from("event_members").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "joined"),
    supabase
      .from("event_invite_links")
      .select("token, status")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getCurrentUserId()
  ]);
  const typedInvite = invite as Invite | null;
  const isOwner = currentUserId === event.owner_user_id;
  const isJoined = currentUserId ? await loadEventMembership(eventId, currentUserId) : false;
  const canStartAdjustment = canStartDateAdjustment(event.status, typedInvite?.status);
  const isEventTerminal = isTerminalEventStatus(event.status);
  const inviteUrl = typedInvite ? buildEventInviteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", typedInvite.token) : null;

  const progress = resolveEventProgress(event.status, (event.plans ?? []) as EventPlan[]);
  const hasPlans = ((event.plans as EventPlan[] | undefined)?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event"
        title={event.title}
        action={isOwner && canStartAdjustment ? <ButtonLink href={`/events/${event.id}/plans/new`}>日程調整を始める</ButtonLink> : null}
        summary={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="rounded-full border border-line px-3 py-1 font-bold text-pine">{progress.statusLabel}</span>
            <span className="text-muted">参加者 {memberCount ?? 0}人</span>
            {progress.highlightAt ? (
              <span className="text-muted">
                {progress.highlightLabel} {formatDateTime(progress.highlightAt)}
              </span>
            ) : null}
          </div>
        }
      />

      <EventDetailTabs eventId={event.id} active={tab} />

      {tab === "overview" ? (
        <>
          {hasPlans || !isEventTerminal ? (
            <section className="space-y-4">
              <SectionHeading title="日程調整" />
              {hasPlans ? (
                <div className="grid gap-3">
                  {((event.plans ?? []) as EventPlan[]).map((plan) => (
                    <Link key={plan.id} href={`/plans/${plan.id}`} className="rounded-card border border-line bg-surface p-5 shadow-raise hover:border-moss">
                      <span className="block font-semibold text-ink">{plan.title ?? "日程調整"}</span>
                      <span className="mt-1 block text-sm text-muted">
                        {planStatusLabels[plan.status as keyof typeof planStatusLabels]} / 回答期限 {formatDateTime(plan.answer_deadline_at)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState>
                  {canStartAdjustment ? "日程調整を始めると、候補日時を入力できます。" : "参加者を集めたら、参加受付を終了して日程調整へ進みます。"}
                </EmptyState>
              )}
            </section>
          ) : null}

          <Card>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Info label="カテゴリ" value={categoryLabels[event.category as keyof typeof categoryLabels]} />
              <Info label="場所メモ" value={event.location_name ?? "未設定"} />
              <Info label="URL" value={event.url ?? "未設定"} />
              <Info label="メモ" value={event.memo ?? "未設定"} />
            </dl>
            <div>
              <GoogleMapsDirectionsLink destination={event.location_name} />
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              {isOwner ? (
                <>
                  <SecondaryLink href={`/events/${event.id}/edit`}>イベント情報を編集</SecondaryLink>
                  <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
                </>
              ) : null}
              {isJoined ? (
                <form action={duplicateEventAction.bind(null, event.id)}>
                  <SubmitButton variant="secondary" icon={<CopyPlus aria-hidden="true" className="h-4 w-4" />}>
                    このメンバーでもう一度
                  </SubmitButton>
                </form>
              ) : null}
            </div>
          </Card>
        </>
      ) : null}

      {tab === "members" ? (
        <>
          {isOwner ? (
            <Card>
              <EventMemberInviteCard
                memberCount={memberCount ?? 0}
                inviteUrl={inviteUrl}
                status={typedInvite?.status ?? null}
                closeInviteAction={closeEventInvitesAction.bind(null, event.id)}
                reissueInviteAction={revokeAndCreateEventInviteAction.bind(null, event.id)}
              />
            </Card>
          ) : (
            <Card>
              <SectionHeading
                title="参加者"
                description={`参加済み ${memberCount ?? 0}人`}
                action={
                  isEventTerminal ? null : canStartAdjustment ? (
                    <Badge tone="done">日程調整の準備中</Badge>
                  ) : (
                    <Badge tone="neutral">参加者を募集中</Badge>
                  )
                }
              />
            </Card>
          )}

          {isOwner ? (
            <Suspense fallback={<InviteCandidatesSkeleton />}>
              <EventMembersInviteCandidates eventId={eventId} supabase={supabase} />
            </Suspense>
          ) : null}
        </>
      ) : null}

      {tab === "chat" ? (
        currentUserId ? (
          <Suspense fallback={<ChatSkeleton />}>
            <EventChatSection
              eventId={eventId}
              currentUserId={currentUserId}
              canPost={isJoined && event.status !== "cancelled"}
              unavailableReason={event.status === "cancelled" ? "イベントが中止されたため、投稿できません。" : undefined}
            />
          </Suspense>
        ) : (
          <Card>
            <EventChat
              messages={[]}
              action={createEventMessageAction.bind(null, eventId)}
              canPost={false}
              unavailableReason={event.status === "cancelled" ? "イベントが中止されたため、投稿できません。" : undefined}
            />
          </Card>
        )
      ) : null}

      {tab === "tasks" ? (
        <Suspense fallback={<TasksSkeleton />}>
          <EventTasksSection eventId={eventId} canEdit={isJoined && event.status !== "cancelled"} />
        </Suspense>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <SecondaryLink href="/events">イベント一覧へ</SecondaryLink>
      </div>
    </div>
  );
}

async function EventMembersInviteCandidates({ eventId, supabase }: { eventId: string; supabase: SupabaseServerClient }) {
  const page = await loadInviteCandidates(eventId, supabase);

  return (
    <Card>
      <EventInviteCandidates
        candidates={page.items}
        nextCursor={page.nextCursor}
        action={createEventUserInvitationsAction.bind(null, eventId)}
        loadMoreAction={loadEventInviteCandidatesAction.bind(null, eventId)}
      />
    </Card>
  );
}

async function EventChatSection({
  eventId,
  currentUserId,
  canPost,
  unavailableReason
}: {
  eventId: string;
  currentUserId: string;
  canPost: boolean;
  unavailableReason: string | undefined;
}) {
  const messages = await loadEventChatMessages(eventId, currentUserId);

  return (
    <Card>
      <EventChat
        messages={messages}
        action={createEventMessageAction.bind(null, eventId)}
        canPost={canPost}
        unavailableReason={unavailableReason}
      />
    </Card>
  );
}

async function EventTasksSection({ eventId, canEdit }: { eventId: string; canEdit: boolean }) {
  const { tasks, members } = await loadEventTasks(eventId);

  return (
    <Card>
      <EventTaskList
        tasks={tasks}
        members={members}
        canEdit={canEdit}
        createAction={createEventTaskAction.bind(null, eventId)}
        toggleAction={(taskId) => toggleEventTaskDoneAction.bind(null, eventId, taskId)}
        assignAction={(taskId) => updateEventTaskAssigneeAction.bind(null, eventId, taskId)}
        deleteAction={(taskId) => deleteEventTaskAction.bind(null, eventId, taskId)}
      />
    </Card>
  );
}

function InviteCandidatesSkeleton() {
  return (
    <Card className="space-y-3" role="status" aria-label="招待候補を読み込み中">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </Card>
  );
}

function ChatSkeleton() {
  return (
    <Card className="space-y-3" role="status" aria-label="チャットを読み込み中">
      <Skeleton className="h-5 w-1/4" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </Card>
  );
}

function TasksSkeleton() {
  return (
    <Card className="space-y-3" role="status" aria-label="タスクを読み込み中">
      <Skeleton className="h-5 w-1/4" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </Card>
  );
}

async function loadEventTasks(
  eventId: string
): Promise<{ tasks: EventTask[]; members: EventTaskMember[] }> {
  const admin = createSupabaseAdminClient();
  const [{ data: taskRows }, { data: memberRows }] = await Promise.all([
    admin
      .from("event_tasks")
      .select("id, title, assignee_user_id, done_at, sort_order")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true })
      .limit(100),
    admin.from("event_members").select("user_id, display_name").eq("event_id", eventId).eq("status", "joined")
  ]);

  const members = ((memberRows ?? []) as { user_id: string; display_name: string }[]).map((member) => ({
    userId: member.user_id,
    displayName: member.display_name
  }));
  const nameByUserId = new Map(members.map((member) => [member.userId, member.displayName]));

  const tasks = ((taskRows ?? []) as EventTaskRow[]).map<EventTask>((row) => ({
    id: row.id,
    title: row.title,
    assigneeUserId: row.assignee_user_id,
    assigneeName: row.assignee_user_id ? nameByUserId.get(row.assignee_user_id) ?? null : null,
    doneAt: row.done_at,
    sortOrder: row.sort_order
  }));

  return { tasks, members };
}

async function loadEventMembership(eventId: string, currentUserId: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data: membership, error } = await admin
    .from("event_members")
    .select("user_id")
    .eq("event_id", eventId)
    .eq("user_id", currentUserId)
    .eq("status", "joined")
    .maybeSingle();

  if (error) {
    throw new Error("チャットの参加状態を確認できませんでした");
  }

  return Boolean(membership);
}

async function loadEventChatMessages(eventId: string, currentUserId: string): Promise<EventMessage[]> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error: messagesError } = await admin
    .from("event_messages")
    .select("id, author_user_id, body, created_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (messagesError) {
    throw new Error("チャットを読み込めませんでした");
  }

  const messages = (rows ?? []) as EventMessageRow[];
  const authorIds = [...new Set(messages.map((message) => message.author_user_id))];
  const { data: members, error: membersError } = authorIds.length
    ? await admin.from("event_members").select("user_id, display_name").eq("event_id", eventId).in("user_id", authorIds)
    : { data: [], error: null };

  if (membersError) {
    throw new Error("チャット参加者を読み込めませんでした");
  }

  const names = new Map((members ?? []).map((member) => [member.user_id, member.display_name]));

  return messages.reverse().map((message) => ({
    id: message.id,
    authorName: names.get(message.author_user_id) ?? "参加者",
    body: message.body,
    createdAt: message.created_at,
    isOwn: message.author_user_id === currentUserId
  }));
}

async function loadInviteCandidates(eventId: string, supabase: SupabaseServerClient): Promise<ConnectionPage> {
  const { data, error } = await supabase.rpc("list_event_invite_candidates", {
    p_event_id: eventId,
    p_query: null,
    p_cursor_at: null,
    p_cursor_user_id: null,
    p_limit: 20
  });

  if (error) {
    throw new Error("招待候補を読み込めませんでした。");
  }

  return mapConnectionPage(data ?? []);
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-surface p-4">
      <dt className="text-eyebrow uppercase text-muted">{label}</dt>
      <dd className="mt-2 break-words text-body font-bold text-ink">{value}</dd>
    </div>
  );
}
