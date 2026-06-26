import { Card, EmptyState, PageHeader } from "@/components/ui";
import { LoginPanel, SetupPanel } from "@/components/state-panels";
import { planStatusLabels } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  if (!hasSupabaseEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader title="調整中" />
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
        <PageHeader title="調整中" />
        <LoginPanel />
      </div>
    );
  }

  const { data: plans } = await supabase
    .from("plans")
    .select("id, title, status, answer_deadline_at, events(title)")
    .eq("owner_user_id", user.id)
    .in("status", ["draft", "collecting_answers"])
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader title="調整中" description="回答受付中、または下書きの予定です。" />
      {(plans ?? []).length > 0 ? (
        <div className="grid gap-4">
          {(plans ?? []).map((plan) => {
            const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
            return (
              <a key={plan.id} href={`/plans/${plan.id}`} className="block">
                <Card className="transition hover:border-moss">
                  <h2 className="font-semibold text-ink">{event?.title ?? "イベント未設定"}</h2>
                  <p className="mt-2 text-sm text-ink/60">
                    {plan.title ?? "参加予定"} / {planStatusLabels[plan.status as keyof typeof planStatusLabels]} / 回答期限{" "}
                    {formatDateTime(plan.answer_deadline_at)}
                  </p>
                </Card>
              </a>
            );
          })}
        </div>
      ) : (
        <EmptyState>調整中の予定はありません。</EmptyState>
      )}
    </div>
  );
}
