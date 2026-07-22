import { notFound } from "next/navigation";

import { AnswerForm } from "@/components/answer-form";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SetupPanel } from "@/components/state-panels";
import { canAnswerPlan } from "@/lib/domain/availability";
import { getPublicAnswerData } from "@/lib/server/admin/public-answer";
import { hasSupabaseAdminEnv } from "@/lib/supabase/server";

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

  const data = await getPublicAnswerData(token);
  if (!data) {
    notFound();
  }

  const candidateDates = data.candidates;
  const answerable =
    canAnswerPlan(data.answerDeadlineAt, new Date()) &&
    canAnswerPlan(data.expiresAt, new Date());

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Answer" title="日程回答" description={`${data.eventTitle ?? "イベント"} / ${data.title ?? "日程調整"}`} />
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
