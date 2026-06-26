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
    .select("*, participants(display_name), candidate_dates(start_at)")
    .eq("id", planId)
    .single();

  if (!plan) {
    notFound();
  }

  const action = updatePlanAction.bind(null, planId);

  return (
    <div className="space-y-6">
      <PageHeader title="参加予定編集" description={plan.title ?? "参加予定"} />
      <Card>
        <PlanForm action={action} plan={plan} submitLabel="参加予定を更新" />
      </Card>
    </div>
  );
}
