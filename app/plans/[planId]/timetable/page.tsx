import { notFound, redirect } from "next/navigation";
import React from "react";

import { PlanTimetable } from "@/components/plan/plan-timetable";
import { PlanTimetableForm } from "@/components/plan/plan-timetable-form";
import { Alert, Card, PageHeader, SecondaryLink } from "@/components/ui";
import {
  createPlanTimetableItemAction,
  deletePlanTimetableItemAction,
  updatePlanTimetableItemAction
} from "@/lib/actions/plan/plan-timetable";
import { listEventDates, nextTimetableStartAt, sortTimetableItems, toJstDateKey } from "@/lib/domain/plan/plan-timetable";
import { formatDateTimeRange, formatJstTime } from "@/lib/shared/format";
import { createSupabaseAdminClient, getCurrentUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ParticipantRow = {
  id: string;
  display_name: string;
  status: string;
  user_id: string | null;
};

type AssigneeRow = {
  participant_id: string;
};

type TimetableItemRow = {
  id: string;
  start_at: string;
  end_at: string | null;
  title: string;
  note: string | null;
  created_at: string;
  plan_timetable_item_assignees: AssigneeRow[] | null;
};

export default async function PlanTimetablePage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/login");
  }

  // plans と participants の select ポリシー(001)は「plan の owner だけ」で、
  // イベントメンバー向けのポリシーが無い。ユーザーのクライアントで引くと、
  // plan の participants に入っている人でも画面を開けず404になる。
  // 誰が見てよいかは下の canView で判定するので、読み取りは admin で行う（清算ページと同じ流儀）。
  const supabase = createSupabaseAdminClient();
  const { data: plan, error: planError } = await supabase
    .from("plans")
    .select(
      "id, title, status, owner_user_id, confirmed_start_at, confirmed_end_at, events(id, title), participants(id, display_name, status, user_id)"
    )
    .eq("id", planId)
    .single();

  // クエリ自体の失敗を404にしない。列の欠落やスキーマ不整合が
  // 「ページが見つかりません」として出ると原因を追えなくなる。
  if (planError && planError.code !== "PGRST116") {
    throw new Error(`進行表のデータ取得に失敗しました: ${planError.message}`);
  }
  if (!plan) {
    notFound();
  }

  const participants = ((plan.participants ?? []) as ParticipantRow[]).sort((a, b) =>
    a.display_name.localeCompare(b.display_name, "ja")
  );
  const isOwner = plan.owner_user_id === userId;
  const canView = isOwner || participants.some((participant) => participant.user_id === userId);
  if (!canView) {
    notFound();
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("plan_timetable_items")
    .select("id, start_at, end_at, title, note, created_at, plan_timetable_item_assignees(participant_id)")
    .eq("plan_id", planId);

  if (itemsError) {
    throw new Error(`進行表の取得に失敗しました: ${itemsError.message}`);
  }

  const participantById = new Map(participants.map((participant) => [participant.id, participant]));
  const items = sortTimetableItems(
    ((itemRows ?? []) as TimetableItemRow[]).map((row) => ({
      id: row.id,
      startAt: row.start_at,
      endAt: row.end_at,
      title: row.title,
      note: row.note,
      createdAt: row.created_at,
      // 担当は participants から名前を引く。退会や削除で引けない行は落とす。
      assignees: (row.plan_timetable_item_assignees ?? [])
        .map((assignee) => participantById.get(assignee.participant_id))
        .filter((participant): participant is ParticipantRow => Boolean(participant))
        .map((participant) => ({
          participantId: participant.id,
          displayName: participant.display_name,
          status: participant.status
        }))
    }))
  );

  const event = Array.isArray(plan.events) ? plan.events[0] : plan.events;

  // 編集できる集合（event_members, status=joined）は canView の集合（オーナー or この plan の
  // participant）と別物。共有リンクから回答しただけのログイン済みユーザーは participant 行を
  // 持つのでここまでは通るが、イベントメンバーとは限らない。その人にも編集UIを出すと、
  // Server Action 側（lib/actions/plan-timetable.ts）の event_members チェックで弾かれて
  // 「編集する権限がありません」と落ちるので、ここで先に閲覧のみに倒す。
  let isMember = false;
  if (event) {
    const { data: membership, error: membershipError } = await supabase
      .from("event_members")
      .select("id")
      .eq("event_id", event.id)
      .eq("user_id", userId)
      .eq("status", "joined")
      .maybeSingle();

    if (membershipError) {
      throw new Error(`参加状況の取得に失敗しました: ${membershipError.message}`);
    }
    isMember = Boolean(membership);
  }

  const isConfirmed = plan.status === "date_confirmed";
  const canEdit = isConfirmed && isMember;
  const eventDates = listEventDates(plan.confirmed_start_at, plan.confirmed_end_at);
  const nextStartAt = nextTimetableStartAt(items, plan.confirmed_start_at);
  // 日付と時刻は同じ「次の開始時刻」から導く。時刻だけ使って日付を初日に固定すると、
  // 2日目の行の次を足すときに「1日目の16:00」というちぐはぐな初期値になる。
  const nextDateKey = nextStartAt ? toJstDateKey(nextStartAt) : null;
  // 開催期間の外に出るのは最後の行が深夜まで伸びたときだけなので、初日ではなく最終日に寄せる。
  // nextTimetableStartAt は既存行か開催開始より後しか返さないため、前にはみ出すことはない。
  const isPastEventPeriod = nextDateKey !== null && !eventDates.includes(nextDateKey);
  const defaultDate =
    nextDateKey && eventDates.includes(nextDateKey)
      ? nextDateKey
      : (eventDates[eventDates.length - 1] ?? toJstDateKey(new Date().toISOString()));
  // 日付だけ最終日に寄せて時刻はそのまま（例: 23:30 の行の次で 00:30）使うと、
  // 丸めた日付の「先頭」に来てしまい、追加した行が一覧の最上部に入る
  // （単日イベントは初日＝最終日なので必ず起きる）。日付をまたいで丸めたときは
  // 時刻もその日の終わりに寄せて、追加した行が最後尾に来るようにする。
  const defaultStartTime = isPastEventPeriod ? "23:59" : nextStartAt ? formatJstTime(nextStartAt) : "10:00";
  const createItem = createPlanTimetableItemAction.bind(null, plan.id);
  const deleteItem = (itemId: string) => deletePlanTimetableItemAction.bind(null, plan.id, itemId);
  const editItem = (itemId: string) => updatePlanTimetableItemAction.bind(null, plan.id, itemId);
  // 追加・一覧内の編集・両方が同じ参加者リストを使うので、ここで1回だけ整形して使い回す。
  const participantOptions = participants.map((participant) => ({
    participantId: participant.id,
    displayName: participant.display_name,
    status: participant.status
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Timetable"
        title="当日の進行表"
        description={
          [event?.title?.trim(), plan.title?.trim()].filter(Boolean).join(" / ") || "当日の流れを時刻で共有します。"
        }
        action={<SecondaryLink href={`/plans/${plan.id}`}>日程調整へ戻る</SecondaryLink>}
      />

      {plan.confirmed_start_at ? (
        <Card padding="p-4">
          <p className="text-caption text-muted">開催日時</p>
          <p className="mt-1 text-body font-bold text-ink">
            {formatDateTimeRange(plan.confirmed_start_at, plan.confirmed_end_at)}
          </p>
        </Card>
      ) : null}

      {isConfirmed ? null : (
        <Alert tone="warn">
          {/* 中止された plan も編集不可だが、「未確定」と出すと事実と違う。 */}
          {plan.status === "cancelled"
            ? "この日程調整は中止されています。進行表は閲覧のみです。"
            : "日程がまだ確定していないため、進行表は閲覧のみです。"}
        </Alert>
      )}

      <Card className="space-y-4">
        {/* 「いまここ」はサーバー描画時の時刻で決める。全ページ force-dynamic なので再読込で追いつく。 */}
        <PlanTimetable
          items={items}
          now={new Date()}
          canEdit={canEdit}
          deleteAction={deleteItem}
          edit={{ action: editItem, participants: participantOptions, eventDates }}
        />

        {canEdit ? (
          <PlanTimetableForm
            action={createItem}
            participants={participantOptions}
            eventDates={eventDates}
            defaultDate={defaultDate}
            defaultStartTime={defaultStartTime}
          />
        ) : null}
      </Card>
    </div>
  );
}
