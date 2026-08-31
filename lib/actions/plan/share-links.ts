"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

async function requirePlanOwner(planId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error } = await supabase
    .from("plans")
    .select("id, answer_deadline_at")
    .eq("id", planId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error || !plan) {
    throw new Error("この日程調整を管理する権限がありません。");
  }

  return { supabase, plan };
}

function revalidatePlan(planId: string) {
  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
}

async function revokeOpenLinks(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  planId: string
) {
  const { error } = await supabase
    .from("share_links")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("plan_id", planId)
    .eq("status", "open");

  if (error) {
    throw new Error(error.message);
  }
}

export async function revokeShareLinkAction(planId: string) {
  const { supabase } = await requirePlanOwner(planId);
  await revokeOpenLinks(supabase, planId);
  revalidatePlan(planId);
}

export async function reissueShareLinkAction(planId: string) {
  const { supabase, plan } = await requirePlanOwner(planId);
  await revokeOpenLinks(supabase, planId);

  const { error } = await supabase.from("share_links").insert({
    plan_id: planId,
    token: randomUUID(),
    purpose: "answer",
    status: "open",
    expires_at: plan.answer_deadline_at
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePlan(planId);
}
