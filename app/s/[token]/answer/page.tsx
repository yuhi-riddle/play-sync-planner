import { notFound } from "next/navigation";

import { AnswerForm } from "@/components/answer-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/state-panels";
import { canAnswerPlan } from "@/lib/domain/availability";
import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublicAnswerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!hasSupabaseAdminEnv()) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Answer" title="日程回答" />
        <SetupPanel />
      </div>
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: link } = await supabase
    .from("share_links")
    .select("token, expires_at, plans(id, title, answer_deadline_at, events(title), candidate_dates(id, start_at, end_at, is_all_day))")
    .eq("token", token)
    .eq("purpose", "answer")
    .single();

  if (!link) {
    notFound();
  }

  const plan = Array.isArray(link.plans) ? link.plans[0] : link.plans;
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;
  const candidateDates = plan.candidate_dates ?? [];
  const answerable = canAnswerPlan(plan.answer_deadline_at, new Date()) && canAnswerPlan(link.expires_at, new Date());

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Answer" title="日程回答" description={`${event?.title ?? "イベント"} / ${plan.title ?? "日程調整"}`} />
      <Card>
        {!answerable ? (
          <EmptyState>回答期限を過ぎているため、回答できません。</EmptyState>
        ) : candidateDates.length > 0 ? (
          <AnswerForm token={token} candidateDates={candidateDates} />
        ) : (
          <EmptyState>回答できる候補日時がまだありません。</EmptyState>
        )}
      </Card>
    </div>
  );
}
