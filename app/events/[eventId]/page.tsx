import { notFound } from "next/navigation";

import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { categoryLabels, eventStatusLabels, planStatusLabels } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type EventPlan = {
  id: string;
  title: string | null;
  status: string;
  confirmed_start_at: string | null;
  answer_deadline_at: string | null;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={event.title}
        description="この予定の日程調整を作成・確認します。"
        action={<ButtonLink href={`/events/${event.id}/plans/new`}>日程調整を始める</ButtonLink>}
      />

      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Info label="カテゴリ" value={categoryLabels[event.category as keyof typeof categoryLabels]} />
          <Info label="状態" value={eventStatusLabels[event.status as keyof typeof eventStatusLabels]} />
          <Info label="場所" value={event.location_name ?? "未設定"} />
          <Info label="URL" value={event.url ?? "未設定"} />
          <Info label="メモ" value={event.memo ?? "未設定"} />
        </dl>
        <div className="mt-5">
          <SecondaryLink href={`/events/${event.id}/edit`}>予定を編集</SecondaryLink>
        </div>
      </Card>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-ink">日程調整</h2>
        {(event.plans as EventPlan[] | undefined)?.length ? (
          <div className="grid gap-3">
            {((event.plans ?? []) as EventPlan[]).map((plan) => (
              <a key={plan.id} href={`/plans/${plan.id}`} className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft hover:border-moss">
                <span className="block font-semibold text-ink">{plan.title ?? "日程調整"}</span>
                <span className="mt-1 block text-sm text-ink/60">
                  {planStatusLabels[plan.status as keyof typeof planStatusLabels]} / 回答期限 {formatDateTime(plan.answer_deadline_at)}
                </span>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState>日程調整はまだありません。上の「日程調整を始める」から候補日時を入力します。</EmptyState>
        )}
      </section>
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
