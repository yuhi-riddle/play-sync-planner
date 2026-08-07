"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { errorState, failWith, successState, type ActionState } from "@/lib/domain/action-state";
import { participantDeletionRefusal } from "@/lib/domain/participant-deletion";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentUserId } from "@/lib/supabase/server";

type ExpenseTitleRow = { title: string | null };
type SplitRow = { expenses: ExpenseTitleRow | ExpenseTitleRow[] | null };

function titleOf(expense: ExpenseTitleRow | ExpenseTitleRow[] | null) {
  const row = Array.isArray(expense) ? expense[0] : expense;
  return row?.title?.trim() || "名前のない立替";
}

/**
 * 参加者を削除する。
 *
 * 共有リンクからの回答は表示名の完全一致でしか同定していないので
 * （lib/domain/participant-identity.ts）、名前を少し変えて回答し直すと
 * 参加者が増える。増えた参加者は割り勘の対象にもなるため、消す手段が要る。
 *
 * ただしお金が絡んでいる参加者は消さない。理由は
 * lib/domain/participant-deletion.ts に書いてある。
 */
/*
 * useActionState は action(prevState, formData) で呼ぶが、この操作は
 * どちらも読まない（消す相手は bind 済み）。受け取らない形にしておく。
 * 引数の少ない関数は、多いシグネチャの place に渡せる。
 */
export async function deletePlanParticipantAction(
  planId: string,
  participantId: string
): Promise<ActionState> {
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select("id, event_id")
    .eq("id", planId)
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (planError || !plan) {
    return errorState("この日程調整を管理する権限がありません。");
  }

  const admin = createSupabaseAdminClient();
  const { data: participant, error: participantError } = await admin
    .from("participants")
    .select("id, display_name")
    // 別プランの参加者IDを渡して消せないよう、plan_id でも絞る。
    .eq("id", participantId)
    .eq("plan_id", planId)
    .maybeSingle();

  if (participantError || !participant) {
    return errorState("この参加者は見つかりませんでした。");
  }

  const [{ data: paidExpenses, error: paidError }, { data: splits, error: splitsError }] = await Promise.all([
    admin.from("expenses").select("title").eq("plan_id", planId).eq("payer_participant_id", participantId),
    admin.from("expense_splits").select("expenses(title)").eq("participant_id", participantId)
  ]);

  if (paidError || splitsError) {
    return failWith("参加者を削除できませんでした。", paidError ?? splitsError);
  }

  /*
   * 断る理由は、画面に出さないと意味がない。
   * Server Action で throw すると本番では digest 付きの汎用文言に差し替わるので
   * （lib/domain/action-state.ts）、ActionState で返す。
   */
  const refusal = participantDeletionRefusal(participant.display_name, {
    paidExpenseTitles: ((paidExpenses ?? []) as ExpenseTitleRow[]).map((expense) => titleOf(expense)),
    splitExpenseTitles: ((splits ?? []) as SplitRow[]).map((split) => titleOf(split.expenses))
  });

  if (refusal) {
    return errorState(refusal);
  }

  const { error: deleteError } = await admin
    .from("participants")
    .delete()
    .eq("id", participantId)
    .eq("plan_id", planId);

  if (deleteError) {
    return failWith("参加者を削除できませんでした。", deleteError);
  }

  revalidatePath("/");
  revalidatePath(`/events/${plan.event_id}`);
  revalidatePath(`/plans/${planId}`);
  revalidatePath(`/plans/${planId}/settlement`);
  revalidatePath(`/plans/${planId}/timetable`);

  return successState(`${participant.display_name}さんを参加者から外しました。`);
}
