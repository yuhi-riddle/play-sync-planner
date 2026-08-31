import { notFound } from "next/navigation";

import { PlanForm } from "@/components/plan/plan-form";
import { BackLink } from "@/components/ui/back-link";
import { Card, PageHeader } from "@/components/ui";
import { updatePlanAction } from "@/lib/actions/plan/plans";
import { createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select(
      "*, participants(display_name), candidate_dates(start_at, end_at, is_all_day), plan_reminder_settings(reminder_offset_minutes, reminder_offsets_minutes)"
    )
    .eq("id", planId)
    .single();
  const userId = await getCurrentUserId();

  if (!plan) {
    notFound();
  }

  const { data: calendarIntegration } = userId
    ? await supabase.from("calendar_integrations").select("id").eq("user_id", userId).eq("provider", "google").maybeSingle()
    : { data: null };
  const action = updatePlanAction.bind(null, planId);

  return (
    <div className="space-y-6">
      <BackLink href={`/plans/${planId}`}>日程調整へ戻る</BackLink>
      <PageHeader eyebrow="Schedule" title="日程調整を編集" description="候補日時と回答期限を更新します。" />
      <Card>
        <PlanForm
          action={action}
          plan={plan}
          submitLabel="日程調整を更新"
          calendarAvailability={{ enabled: Boolean(calendarIntegration) }}
        />
      </Card>
    </div>
  );
}
