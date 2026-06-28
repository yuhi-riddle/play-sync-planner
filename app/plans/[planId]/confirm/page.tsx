import { notFound, redirect } from "next/navigation";

import { ConfirmForm } from "@/components/confirm-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { summarizeCandidateAnswers } from "@/lib/domain/confirmation";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CandidateRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  availability_answers: Array<{ answer: "yes" | "maybe" | "no" | "unanswered" }>;
};

export default async function ConfirmPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("id, title, owner_user_id, participants(id), candidate_dates(id, start_at, end_at, availability_answers(answer))")
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .single();

  if (!plan) {
    notFound();
  }

  const participantCount = Array.isArray(plan.participants) ? plan.participants.length : 0;
  const summaries = summarizeCandidateAnswers((plan.candidate_dates ?? []) as CandidateRow[], participantCount);

  return (
    <div className="space-y-6">
      <PageHeader title="日程確定" description={plan.title ?? "日程調整"} />
      <Card>
        {summaries.length > 0 ? <ConfirmForm planId={planId} candidates={summaries} /> : <EmptyState>候補日がありません。</EmptyState>}
      </Card>
    </div>
  );
}
