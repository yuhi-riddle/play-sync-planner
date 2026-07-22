import Link from "next/link";
import { notFound } from "next/navigation";

import { EventCancelAction } from "@/components/event-cancel-action";
import { EventChat } from "@/components/event-chat";
import { EventInviteCandidates } from "@/components/event-invite-candidates";
import { EventMemberInviteCard } from "@/components/event-member-invite-card";
import { GoogleMapsDirectionsLink } from "@/components/google-maps-directions-link";
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { createEventUserInvitationsAction } from "@/lib/actions/connections";
import { closeEventInvitesAction, revokeAndCreateEventInviteAction } from "@/lib/actions/event-members";
import { createEventMessageAction } from "@/lib/actions/event-messages";
import { cancelEventAction } from "@/lib/actions/events";
import { categoryLabels, planStatusLabels } from "@/lib/constants";
import { buildEventInviteUrl } from "@/lib/domain/event-members";
import { loadEventDetailData } from "@/lib/event-detail-data";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const detail = await loadEventDetailData({ supabase, eventId, currentUserId: user?.id ?? null });
  if (!detail) notFound();

  const { event, isOwner, memberCount, invite, nearestPlan, chat } = detail;
  const canStartAdjustment = invite?.status === "closed";
  const inviteUrl = invite ? buildEventInviteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", invite.token) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Event"
        title={event.title}
        description="イベントの基本情報、参加者、日程調整をここで管理します。"
        action={isOwner && canStartAdjustment ? <ButtonLink href={`/events/${event.id}/plans/new`}>日程調整を始める</ButtonLink> : null}
      />

      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="カテゴリ" value={categoryLabels[event.category as keyof typeof categoryLabels]} />
          <Info label="進行状況" value={event.status === "confirmed" ? "確定" : nearestPlan ? "日程調整中" : "参加者募集中"} />
          <Info label="場所メモ" value={event.location_name ?? "未設定"} />
          <Info label="URL" value={event.url ?? "未設定"} />
          <Info label="メモ" value={event.memo ?? "未設定"} />
        </dl>
        <div>
          <GoogleMapsDirectionsLink destination={event.location_name} />
        </div>
        {isOwner ? (
          <div className="mt-5 flex flex-wrap gap-3">
            <SecondaryLink href={`/events/${event.id}/edit`}>イベント情報を編集</SecondaryLink>
            <EventCancelAction action={cancelEventAction.bind(null, event.id)} />
          </div>
        ) : null}
      </Card>

      {isOwner ? (
        <Card>
          <EventMemberInviteCard
            memberCount={memberCount}
            inviteUrl={inviteUrl}
            status={invite?.status ?? null}
            closeInviteAction={closeEventInvitesAction.bind(null, event.id)}
            reissueInviteAction={revokeAndCreateEventInviteAction.bind(null, event.id)}
          />
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">参加者</h2>
              <p className="mt-2 text-sm text-muted">参加済み {memberCount}人</p>
            </div>
            {canStartAdjustment ? <span className="text-sm font-bold text-pine">日程調整の準備中</span> : <span className="text-sm font-bold text-muted">参加者を募集中</span>}
          </div>
        </Card>
      )}

      {isOwner ? (
        <Card>
          <EventInviteCandidates eventId={eventId} action={createEventUserInvitationsAction.bind(null, eventId)} />
        </Card>
      ) : null}

      <Card>
        <EventChat
          eventId={eventId}
          messages={chat.messages}
          nextCursor={chat.nextCursor}
          initialError={chat.error}
          action={createEventMessageAction.bind(null, eventId)}
          canPost={chat.isJoined && event.status !== "cancelled"}
          canRecoverPostingPermission={Boolean(chat.error && !chat.isJoined && event.status !== "cancelled")}
          unavailableReason={event.status === "cancelled" ? "イベントが中止されたため、投稿できません。" : undefined}
        />
      </Card>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">日程調整</h2>
        {nearestPlan ? (
          <div className="grid gap-3">
            <Link href={`/plans/${nearestPlan.id}`} className="rounded-control border border-line bg-white p-4 shadow-soft hover:border-moss">
              <span className="block font-semibold text-ink">{nearestPlan.title ?? "日程調整"}</span>
              <span className="mt-1 block text-sm text-muted">
                {planStatusLabels[nearestPlan.status as keyof typeof planStatusLabels]} / 回答期限 {formatDateTime(nearestPlan.answer_deadline_at)}
              </span>
            </Link>
          </div>
        ) : (
          <EmptyState>
            {canStartAdjustment ? "日程調整を始めると、候補日時を入力できます。" : "参加者を集めたら、参加受付を終了して日程調整へ進みます。"}
          </EmptyState>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <SecondaryLink href="/events">イベント一覧へ</SecondaryLink>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control bg-surface p-4">
      <dt className="text-eyebrow uppercase text-muted">{label}</dt>
      <dd className="mt-2 break-words text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
