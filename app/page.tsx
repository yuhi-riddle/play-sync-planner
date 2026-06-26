import { CalendarPlus } from "lucide-react";

import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { planStatusLabels } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="ホーム" description="日程調整中の予定や、直近の確定予定を確認します。" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="space-y-6">
        <PageHeader title="ホーム" description="共有リンクの回答以外はログインして使います。" />
        <LoginPanel />
      </div>
    );
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("id, title, status, confirmed_start_at, answer_deadline_at, events(title)")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  const collecting = (plans ?? []).filter((plan) => plan.status === "collecting_answers");
  const confirmed = (plans ?? []).filter((plan) => plan.status === "date_confirmed");

  return (
    <div className="space-y-8">
      <PageHeader
        title="ホーム"
        description="回答受付中の予定と、確定済みの予定を確認します。"
        action={
          <ButtonLink href="/events/new">
            <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            イベント作成
          </ButtonLink>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-ink">回答受付中</h2>
          <div className="mt-4 space-y-3">
            {collecting.length > 0 ? (
              collecting.map((plan) => {
                const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
                return (
                  <SecondaryLink key={plan.id} href={`/plans/${plan.id}`}>
                    {(event?.title ?? "イベント未設定") + " / " + (plan.title ?? "参加予定")}
                  </SecondaryLink>
                );
              })
            ) : (
              <EmptyState>回答受付中の予定はありません。</EmptyState>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-ink">確定済み</h2>
          <div className="mt-4 space-y-3">
            {confirmed.length > 0 ? (
              confirmed.map((plan) => {
                const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
                return (
                  <a key={plan.id} href={`/plans/${plan.id}`} className="block rounded-lg border border-ink/8 bg-white/62 p-3 transition-colors hover:border-moss/45">
                    <span className="block text-sm font-semibold text-ink">{event?.title ?? "イベント未設定"}</span>
                    <span className="mt-1 block text-sm text-ink/60">{formatDateTime(plan.confirmed_start_at)}</span>
                  </a>
                );
              })
            ) : (
              <EmptyState>確定済みの予定はありません。</EmptyState>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-ink">最近の予定</h2>
        <div className="mt-4 grid gap-3">
          {(plans ?? []).length > 0 ? (
            (plans ?? []).map((plan) => (
              <a key={plan.id} href={`/plans/${plan.id}`} className="rounded-lg border border-ink/8 bg-white/62 p-3 transition-colors hover:border-moss/45">
                <span className="font-semibold text-ink">{plan.title ?? "参加予定"}</span>
                <span className="ml-3 text-sm text-ink/60">{planStatusLabels[plan.status as keyof typeof planStatusLabels]}</span>
              </a>
            ))
          ) : (
            <EmptyState>まだ予定がありません。</EmptyState>
          )}
        </div>
      </Card>
    </div>
  );
}
