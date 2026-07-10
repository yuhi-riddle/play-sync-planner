import Link from "next/link";
import { notFound } from "next/navigation";

import { EventMemberInviteCard } from "@/components/event-member-invite-card";
import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { closeEventInvitesAction, revokeAndCreateEventInviteAction } from "@/lib/actions/event-members";
import { categoryLabels, eventStatusLabels, planStatusLabels } from "@/lib/constants";
import { buildEventInviteUrl } from "@/lib/domain/event-members";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

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

export default async function EventDetailPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("*, plans(id, title, status, confirmed_start_at, answer_deadline_at)")
    .eq("id", eventId)
    .single();

  if (!event) {
    notFound();
  }

  const [{ count: memberCount }, { data: invite }, currentUserId] = await Promise.all([
    supabase.from("event_members").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "joined"),
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
  const canStartAdjustment = typedInvite?.status === "closed";
  const inviteUrl = typedInvite ? buildEventInviteUrl(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000", typedInvite.token) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={event.title}
        description="イベントの基本情報、参加者、日程調整をここで管理します。"
        action={isOwner && canStartAdjustment ? <ButtonLink href={`/events/${event.id}/plans/new`}>日程調整を始める</ButtonLink> : null}
      />

      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="カテゴリ" value={categoryLabels[event.category as keyof typeof categoryLabels]} />
          <Info label="ステータス" value={eventStatusLabels[event.status as keyof typeof eventStatusLabels]} />
          <Info label="場所メモ" value={event.location_name ?? "未設定"} />
          <Info label="URL" value={event.url ?? "未設定"} />
          <Info label="メモ" value={event.memo ?? "未設定"} />
        </dl>
        <div className="mt-5">
          <SecondaryLink href={`/events/${event.id}/edit`}>イベント情報を編集</SecondaryLink>
        </div>
      </Card>

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-ink">参加者</h2>
              <p className="mt-2 text-sm text-ink/65">参加済み {memberCount ?? 0}人</p>
            </div>
            {canStartAdjustment ? <span className="text-sm font-bold text-pine">日程調整の準備中</span> : <span className="text-sm font-bold text-ink/60">参加者を募集中</span>}
          </div>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">日程調整</h2>
        {(event.plans as EventPlan[] | undefined)?.length ? (
          <div className="grid gap-3">
            {((event.plans ?? []) as EventPlan[]).map((plan) => (
              <Link key={plan.id} href={`/plans/${plan.id}`} className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft hover:border-moss">
                <span className="block font-semibold text-ink">{plan.title ?? "日程調整"}</span>
                <span className="mt-1 block text-sm text-ink/60">
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

      <div className="flex flex-wrap gap-3">
        <SecondaryLink href="/events">イベント一覧へ</SecondaryLink>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/58 p-4">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-ink/48">{label}</dt>
      <dd className="mt-2 break-words text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
