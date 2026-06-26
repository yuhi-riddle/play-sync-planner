import { notFound } from "next/navigation";

import { PlanForm } from "@/components/plan-form";
import { Card, PageHeader } from "@/components/ui";
import { createPlanAction } from "@/lib/actions/plans";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase.from("events").select("id, title").eq("id", eventId).single();

  if (!event) {
    notFound();
  }

  const action = createPlanAction.bind(null, eventId);

  return (
    <div className="space-y-6">
      <PageHeader title="日程調整を作成" description={`${event.title} の候補日時と回答期限を決めます。共有リンクから参加者に回答してもらいます。`} />
      <Card>
        <PlanForm action={action} submitLabel="共有リンクを作成" />
      </Card>
    </div>
  );
}
