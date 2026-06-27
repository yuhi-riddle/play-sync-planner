import Link from "next/link";
import { CalendarDays, CalendarPlus, ListChecks, Settings } from "lucide-react";

import { ButtonLink, Card, EmptyState, PageHeader, SecondaryLink } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { planStatusLabels } from "@/lib/constants";

export const dynamic = "force-dynamic";

const homeActions = [
  {
    href: "/events",
    title: "予定一覧",
    description: "作成済みの予定と日程調整を確認します。",
    icon: CalendarDays
  },
  {
    href: "/events/new",
    title: "予定作成",
    description: "まずは予定名とカテゴリだけ決めます。",
    icon: CalendarPlus
  },
  {
    href: "/plans",
    title: "調整カレンダー",
    description: "候補日時の重なりを月表示で見ます。",
    icon: ListChecks
  },
  {
    href: "/settings",
    title: "設定",
    description: "ログイン中のアカウントを確認します。",
    icon: Settings
  }
];

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
        description="進行中の日程調整と、確定した予定をまとめて確認します。"
        action={
          <ButtonLink href="/events/new">
            <CalendarPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            予定作成
          </ButtonLink>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="よく使う操作">
        {homeActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group rounded-lg border border-white/80 bg-cream/86 p-4 shadow-soft transition-colors hover:border-moss/45 hover:bg-white/76 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-mist/55 text-pine transition-colors group-hover:bg-skywash">
              <action.icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <span className="mt-3 block text-base font-bold text-ink">{action.title}</span>
            <span className="mt-1 block text-sm leading-6 text-ink/60">{action.description}</span>
          </Link>
        ))}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-ink">回答受付中</h2>
          <div className="mt-4 space-y-3">
            {collecting.length > 0 ? (
              collecting.map((plan) => {
                const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
                return (
                  <SecondaryLink key={plan.id} href={`/plans/${plan.id}`}>
                    {(event?.title ?? "予定未設定") + " / " + (plan.title ?? "参加予定")}
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
                    <span className="block text-sm font-semibold text-ink">{event?.title ?? "予定未設定"}</span>
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
        <h2 className="text-lg font-semibold text-ink">最近動いた予定</h2>
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
