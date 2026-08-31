"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { toJstDateKey } from "@/lib/domain/plan/plan-timetable";
import { createSupabaseAdminClient, createSupabaseServerClient, getCurrentActiveUser } from "@/lib/supabase/server";

const MAX_TITLE_LENGTH = 100;
const MAX_NOTE_LENGTH = 500;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * 進行表を編集できるのは、日程が確定した plan の、参加済みイベントメンバーだけ。
 * 未確定 plan の進行表は閲覧だけできる（設計docの決定）。
 */
async function requireTimetableEditor(planId: string) {
  const user = await getCurrentActiveUser();
  if (!user) {
    redirect("/login");
  }

  const supabase = await createSupabaseServerClient();
  // plans の select ポリシー(001)は「plan の owner だけ」で、イベントメンバー向けの
  // ポリシーが無い。ユーザーのクライアントで引くと、owner 以外のメンバーは常に0件になり
  // 「日程調整が見つかりません」で落ちて、直後の event_members チェックに届かない。
  // 誰が編集できるかはこの下の event_members チェック（ユーザーのクライアント）が担うので、
  // ここを admin にしても認可の穴にはならない。assertAssigneesBelongToPlan と同じ考え方。
  const admin = createSupabaseAdminClient();
  const { data: plan, error: planError } = await admin
    .from("plans")
    .select("id, event_id, status, confirmed_start_at")
    .eq("id", planId)
    .maybeSingle();

  if (planError) {
    throw new Error(`日程調整の取得に失敗しました: ${planError.message}`);
  }
  if (!plan) {
    throw new Error("日程調整が見つかりません。");
  }
  if (plan.status !== "date_confirmed") {
    throw new Error("日程が確定していない日程調整の進行表は編集できません。");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("event_members")
    .select("id")
    .eq("event_id", plan.event_id)
    .eq("user_id", user.id)
    .eq("status", "joined")
    .maybeSingle();

  if (membershipError) {
    throw new Error(`参加状況の確認に失敗しました: ${membershipError.message}`);
  }
  if (!membership) {
    throw new Error("この進行表を編集する権限がありません。");
  }

  return { supabase, user, plan };
}

/** JSTの日付と時刻からタイムスタンプを作る。DBは timestamptz なのでオフセットを明示する。 */
function toJstTimestamp(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

function readTitle(formData: FormData): string {
  const title = formData.get("title")?.toString().trim() ?? "";

  if (title.length === 0) {
    throw new Error("進行の名前を入力してください。");
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new Error(`名前は${MAX_TITLE_LENGTH}文字以内で入力してください。`);
  }

  return title;
}

function readNote(formData: FormData): string | null {
  const note = formData.get("note")?.toString().trim() ?? "";

  if (note.length === 0) {
    return null;
  }
  if (note.length > MAX_NOTE_LENGTH) {
    throw new Error(`メモは${MAX_NOTE_LENGTH}文字以内で入力してください。`);
  }

  return note;
}

function readSchedule(formData: FormData, fallbackDate: string) {
  const date = formData.get("date")?.toString().trim() || fallbackDate;
  const startTime = formData.get("start_time")?.toString().trim() ?? "";
  const endTime = formData.get("end_time")?.toString().trim() ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("日付を選んでください。");
  }
  if (!/^\d{2}:\d{2}$/.test(startTime)) {
    throw new Error("開始時刻を入力してください。");
  }

  const startAt = toJstTimestamp(date, startTime);

  if (endTime.length === 0) {
    return { startAt, endAt: null };
  }
  if (!/^\d{2}:\d{2}$/.test(endTime)) {
    throw new Error("終了時刻の形式が正しくありません。");
  }

  const endTimestamp = new Date(toJstTimestamp(date, endTime)).getTime();
  const startTimestamp = new Date(startAt).getTime();
  // 22:00-2:00 のような日跨ぎ。DB の end_at >= start_at 制約に合わせて翌日に繰り上げる。
  const endAt = new Date(endTimestamp < startTimestamp ? endTimestamp + DAY_IN_MS : endTimestamp).toISOString();

  return { startAt, endAt };
}

function readAssigneeIds(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("participant_ids")
        .map((value) => value.toString().trim())
        .filter((value) => value.length > 0)
    )
  ];
}

/**
 * 担当に指定された participant が、この plan のものか確かめる。
 *
 * participants は plan ごとの行だが、担当テーブルのRLSは「その item のイベントのメンバーか」しか見ない。
 * 1つのイベントに複数の plan がぶら下がるので、別 plan の参加者を担当に付けられてしまう。入口で塞ぐ。
 *
 * 参照に admin クライアントを使うのは、participants の select ポリシー(001)が「plan の owner だけ」で、
 * ユーザーのクライアントだと owner 以外のメンバーでは常に0件になり担当を1人も付けられなくなるため。
 * 誰が編集できるかは requireTimetableEditor で済んでいるので、ここは存在確認だけ。
 * lib/actions/plans.ts が participants をまたいで読むときと同じ考え方。
 */
async function assertAssigneesBelongToPlan(planId: string, participantIds: string[]) {
  if (participantIds.length === 0) {
    return;
  }

  const admin = createSupabaseAdminClient();
  const { data: known, error } = await admin
    .from("participants")
    .select("id")
    .eq("plan_id", planId)
    .in("id", participantIds);

  if (error) {
    throw new Error(`参加者の確認に失敗しました: ${error.message}`);
  }
  if ((known ?? []).length !== participantIds.length) {
    throw new Error("この日程調整の参加者ではない人は担当にできません。");
  }
}

async function replaceAssignees(supabase: SupabaseClient, itemId: string, participantIds: string[]) {
  if (participantIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("plan_timetable_item_assignees")
    .insert(participantIds.map((participantId) => ({ item_id: itemId, participant_id: participantId })));

  if (error) {
    throw new Error(error.message);
  }
}

async function clearAssignees(supabase: SupabaseClient, itemId: string) {
  const { error } = await supabase.from("plan_timetable_item_assignees").delete().eq("item_id", itemId);

  if (error) {
    throw new Error(error.message);
  }
}

function revalidateTimetable(planId: string) {
  revalidatePath(`/plans/${planId}/timetable`);
}

export async function createPlanTimetableItemAction(planId: string, formData: FormData) {
  const { supabase, user, plan } = await requireTimetableEditor(planId);

  if (!plan.confirmed_start_at) {
    throw new Error("開催日時が決まっていないため、進行表を追加できません。");
  }

  const title = readTitle(formData);
  const note = readNote(formData);
  const { startAt, endAt } = readSchedule(formData, toJstDateKey(plan.confirmed_start_at));
  // 入力の検証はすべて書き込みの前に済ませる。担当だけ後回しにすると、
  // 不正な participant_id を投げられたときに担当の付いていない行が残る。
  const assigneeIds = readAssigneeIds(formData);
  await assertAssigneesBelongToPlan(planId, assigneeIds);

  const { data: created, error } = await supabase
    .from("plan_timetable_items")
    .insert({
      plan_id: planId,
      start_at: startAt,
      end_at: endAt,
      title,
      note,
      created_by_user_id: user.id
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await replaceAssignees(supabase, created.id, assigneeIds);
  revalidateTimetable(planId);
}

export async function updatePlanTimetableItemAction(planId: string, itemId: string, formData: FormData) {
  const { supabase, plan } = await requireTimetableEditor(planId);

  if (!plan.confirmed_start_at) {
    throw new Error("開催日時が決まっていないため、進行表を編集できません。");
  }

  const title = readTitle(formData);
  const note = readNote(formData);
  const { startAt, endAt } = readSchedule(formData, toJstDateKey(plan.confirmed_start_at));
  const assigneeIds = readAssigneeIds(formData);
  await assertAssigneesBelongToPlan(planId, assigneeIds);

  const { data: updated, error } = await supabase
    .from("plan_timetable_items")
    .update({ start_at: startAt, end_at: endAt, title, note })
    .eq("id", itemId)
    .eq("plan_id", planId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  // PostgREST は0件更新でも成功を返す。ここで止めないと、この下の clearAssignees が
  // item_id しか見ないので、別 plan の item を指されたときにその担当を全部消してしまう。
  if (!updated) {
    throw new Error("この進行はこの日程調整のものではありません。");
  }

  // 担当は差分を取らず、いったん消してから入れ直す。組み合わせが変わるだけなので単純さを優先する。
  // 消した後の挿入が失敗すると担当が空のまま残るが、エラーは画面に出るので入れ直せる。
  await clearAssignees(supabase, itemId);
  await replaceAssignees(supabase, itemId, assigneeIds);
  revalidateTimetable(planId);
}

export async function deletePlanTimetableItemAction(planId: string, itemId: string) {
  const { supabase } = await requireTimetableEditor(planId);

  const { error } = await supabase
    .from("plan_timetable_items")
    .delete()
    .eq("id", itemId)
    .eq("plan_id", planId);

  if (error) {
    throw new Error(error.message);
  }

  revalidateTimetable(planId);
}
