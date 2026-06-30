import { notFound } from "next/navigation";

import { PlanForm } from "@/components/plan-form";
import { Card, PageHeader } from "@/components/ui";
import { updatePlanAction } from "@/lib/actions/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase
    .from("plans")
    .select("*, events(category), participants(display_name), candidate_dates(start_at, end_at, is_all_day), plan_reminder_settings(reminder_offset_minutes)")
    .eq("id", planId)
    .single();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!plan) {
    notFound();
  }

  const { data: calendarIntegration } = user
    ? await supabase.from("calendar_integrations").select("id").eq("user_id", user.id).eq("provider", "google").maybeSingle()
    : { data: null };
  const action = updatePlanAction.bind(null, planId);
  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;

  return (
    <div className="space-y-6">
      <PageHeader title="日程調整を編集" description="候補日時と回答期限を更新します。" />
      <Card>
        <PlanForm
          action={action}
          plan={plan}
          submitLabel="日程調整を更新"
          eventCategory={event?.category}
          calendarAvailability={{ enabled: Boolean(calendarIntegration) }}
        />
      </Card>
    </div>
  );
}
