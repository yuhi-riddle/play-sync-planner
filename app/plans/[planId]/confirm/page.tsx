import { notFound, redirect } from "next/navigation";

import { ConfirmForm } from "@/components/confirm-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { pickRecommendedCandidate } from "@/lib/actions/confirm";
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
    .select("id, title, owner_user_id, candidate_dates(id, start_at, end_at, availability_answers(answer))")
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .single();

  if (!plan) {
    notFound();
  }

  const candidates = ((plan.candidate_dates ?? []) as CandidateRow[]).map((candidate) => {
    const counts = candidate.availability_answers.reduce(
      (result, answer) => {
        result[answer.answer] += 1;
        return result;
      },
      { yes: 0, maybe: 0, no: 0, unanswered: 0 }
    );

    return {
      id: candidate.id,
      start_at: candidate.start_at,
      end_at: candidate.end_at,
      ...counts
    };
  });
  const recommendedId = pickRecommendedCandidate(candidates.map((candidate) => ({ candidateDateId: candidate.id, yes: candidate.yes, maybe: candidate.maybe, no: candidate.no })));
  const summaries = candidates.map((candidate) => ({ ...candidate, recommended: candidate.id === recommendedId }));

  return (
    <div className="space-y-6">
      <PageHeader title="日程確定" description={plan.title ?? "参加予定"} />
      <Card>
        {summaries.length > 0 ? <ConfirmForm planId={planId} candidates={summaries} /> : <EmptyState>候補日がありません。</EmptyState>}
      </Card>
    </div>
  );
}
