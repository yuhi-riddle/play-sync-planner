import { notFound } from "next/navigation";

import { PlanForm } from "@/components/plan-form";
import { Card, PageHeader } from "@/components/ui";
import { createPlanAction } from "@/lib/actions/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase.from("events").select("id, title, category").eq("id", eventId).single();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!event) {
    notFound();
  }

  const [{ data: calendarIntegration }, { count: participantCount }] = await Promise.all([
    user
      ? supabase.from("calendar_integrations").select("id").eq("user_id", user.id).eq("provider", "google").maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("event_members").select("id", { count: "exact", head: true }).eq("event_id", eventId).eq("status", "joined")
  ]);
  const action = createPlanAction.bind(null, eventId);

  return (
    <div className="space-y-6">
      <PageHeader title="日程調整を作成" description="参加者全体の空き具合を見ながら、候補日時と回答期限を決めます。" />
      <Card>
        <PlanForm
          action={action}
          eventId={eventId}
          participantCount={participantCount ?? 0}
          submitLabel="この内容で日程調整を始める"
          eventCategory={event.category}
          calendarAvailability={{ enabled: Boolean(calendarIntegration) }}
        />
      </Card>
    </div>
  );
}
