import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParticipantToggleChips } from "@/components/participant-toggle-chips";
import { PlanTimetable } from "@/components/plan-timetable";
import { PlanTimetableForm } from "@/components/plan-timetable-form";
import type { TimetableItem } from "@/lib/domain/plan-timetable";

const participants = [
  { participantId: "p1", displayName: "あかり", status: "confirmed" },
  { participantId: "p2", displayName: "ゆうき", status: "confirmed" },
  { participantId: "p3", displayName: "そら", status: "declined" }
];

describe("ParticipantToggleChips", () => {
  it("辞退した参加者は候補に出さない", () => {
    render(<ParticipantToggleChips participants={participants} />);

    expect(screen.getByRole("button", { name: "あかり" })).toBeInTheDocument();
    // 名前を完全一致で探すと、候補に出たときの accessible name が「そら 辞退」になって
    // 素通りしてしまう。部分一致で探して、出ていないことを本当に確かめる。
    expect(screen.queryByRole("button", { name: /そら/ })).not.toBeInTheDocument();
  });

  it("すでに担当になっている辞退者は候補に残し、辞退と分かるようにする", () => {
    render(<ParticipantToggleChips participants={participants} defaultSelectedIds={["p3"]} />);

    const chip = screen.getByRole("button", { name: /そら/ });
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent("辞退");
  });

  it("キャンセルした参加者も辞退と同じ扱いで候補から外れる", () => {
    const withCancelled = [
      ...participants,
      { participantId: "p4", displayName: "みずき", status: "cancelled" }
    ];
    render(<ParticipantToggleChips participants={withCancelled} />);

    expect(screen.queryByRole("button", { name: /みずき/ })).not.toBeInTheDocument();
  });

  it("すでに担当になっている参加取消者は「取消」と出し、「辞退」とは出さない", () => {
    // components/plan-timetable.tsx の一覧バッジは declined/cancelled で文言を分けている
    // （lib/domain/plan-timetable.ts の inactiveLabels）。この編集フォーム側のチップが
    // 文言を "辞退" 決め打ちで持っていると、同じ画面の一覧に「みずき 取消」、
    // 編集フォームのチップに「みずき 辞退」が同時に出てしまう。
    const withCancelled = [
      ...participants,
      { participantId: "p4", displayName: "みずき", status: "cancelled" }
    ];
    render(<ParticipantToggleChips participants={withCancelled} defaultSelectedIds={["p4"]} />);

    const chip = screen.getByRole("button", { name: /みずき/ });
    expect(chip).toHaveTextContent("取消");
    expect(chip).not.toHaveTextContent("辞退");
  });

  it("「全員」を押しても、すでに担当になっている辞退者は外れない", () => {
    // 全員チップは選択の置き換えではなく合流。置き換えだと辞退済みだが担当の人が
    // ここで選択から外れ、options フィルタの都合でチップ自体が消えて同じ画面では戻せなくなる。
    const { container } = render(
      <ParticipantToggleChips participants={participants} defaultSelectedIds={["p3"]} />
    );

    fireEvent.click(screen.getByRole("button", { name: "全員" }));

    const values = [...container.querySelectorAll('input[name="participant_ids"]')].map(
      (input) => (input as HTMLInputElement).value
    );
    expect(values.sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("押すと hidden input が増え、もう一度押すと消える", () => {
    const { container } = render(<ParticipantToggleChips participants={participants} />);

    fireEvent.click(screen.getByRole("button", { name: "あかり" }));
    expect(container.querySelectorAll('input[name="participant_ids"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "あかり" }));
    expect(container.querySelectorAll('input[name="participant_ids"]')).toHaveLength(0);
  });

  it("全員チップで参加中の全員を選ぶ", () => {
    const { container } = render(<ParticipantToggleChips participants={participants} />);

    fireEvent.click(screen.getByRole("button", { name: "全員" }));

    const values = [...container.querySelectorAll('input[name="participant_ids"]')].map(
      (input) => (input as HTMLInputElement).value
    );
    expect(values.sort()).toEqual(["p1", "p2"]);
  });

  it("選択中のチップは aria-pressed で分かる", () => {
    render(<ParticipantToggleChips participants={participants} />);

    const chip = screen.getByRole("button", { name: "あかり" });
    expect(chip).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });
});

describe("PlanTimetableForm", () => {
  const baseProps = {
    action: vi.fn(),
    participants,
    eventDates: ["2026-08-15"],
    defaultDate: "2026-08-15",
    defaultStartTime: "13:00"
  };

  it("入口は閉じた状態の折りたたみ行にする", () => {
    render(<PlanTimetableForm {...baseProps} />);

    const details = screen.getByText("＋ 進行を追加").closest("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
  });

  it("単日イベントでは日付欄を出さない", () => {
    render(<PlanTimetableForm {...baseProps} />);

    expect(screen.queryByLabelText("日付")).not.toBeInTheDocument();
  });

  it("複数日イベントでは日付欄を出す", () => {
    render(<PlanTimetableForm {...baseProps} eventDates={["2026-08-15", "2026-08-16"]} />);

    expect(screen.getByLabelText("日付")).toBeInTheDocument();
  });

  it("時刻はネイティブの time 入力にする", () => {
    render(<PlanTimetableForm {...baseProps} />);

    expect(screen.getByLabelText("開始")).toHaveAttribute("type", "time");
    expect(screen.getByLabelText("終了（任意）")).toHaveAttribute("type", "time");
  });

  it("defaultStartTime の値がそのまま開始欄の初期値になる", () => {
    // このコンポーネントは +1時間の計算をしない。渡された defaultStartTime を
    // そのまま流すだけであることを確かめる（呼び出し側が「最後の行の1時間後」を計算して渡す）。
    render(<PlanTimetableForm {...baseProps} defaultStartTime="15:30" />);

    expect(screen.getByLabelText("開始")).toHaveValue("15:30");
  });

  it("同じページに複数置いても入力の id が衝突しない", () => {
    const { container } = render(
      <div>
        <PlanTimetableForm {...baseProps} />
        <PlanTimetableForm {...baseProps} idPrefix="timetable-edit-a" summaryLabel="編集" submitLabel="保存" />
      </div>
    );

    const ids = [...container.querySelectorAll('input[name="start_time"]')].map((input) => input.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("defaultValues と submitLabel を渡すと、編集フォームとして各欄の初期値と選択済みチップに反映される", () => {
    render(
      <PlanTimetableForm
        {...baseProps}
        eventDates={["2026-08-15", "2026-08-16"]}
        defaultDate="2026-08-16"
        submitLabel="保存"
        defaultValues={{
          title: "海の家で集合",
          note: "日焼け止めを塗ってから",
          endTime: "16:00",
          assigneeIds: ["p1"]
        }}
      />
    );

    expect(screen.getByLabelText("日付")).toHaveValue("2026-08-16");
    expect(screen.getByLabelText("進行の名前")).toHaveValue("海の家で集合");
    expect(screen.getByLabelText("メモ（任意）")).toHaveValue("日焼け止めを塗ってから");
    expect(screen.getByLabelText("終了（任意）")).toHaveValue("16:00");
    expect(screen.getByRole("button", { name: "あかり" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  });

  it("担当のチップはフォームの内側にあり、参加者IDが送信対象になる", () => {
    const { container } = render(
      <PlanTimetableForm {...baseProps} defaultValues={{ assigneeIds: ["p1"] }} />
    );

    expect(container.querySelector('form input[name="participant_ids"]')).not.toBeNull();
  });

  it("details が開くと scrollIntoView が block: center で呼ばれる", async () => {
    // jsdom には scrollIntoView が無いので、テストのために差し込む。
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    try {
      render(<PlanTimetableForm {...baseProps} />);

      fireEvent.click(screen.getByText("＋ 進行を追加"));
      // jsdom は open 属性をクリックと同期して変えるが、"toggle" イベント自体は
      // 非同期（次のタスク）で発火するため、await で待つ必要がある。
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());

      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });
});

function timetableItem(
  overrides: Partial<TimetableItem> & Pick<TimetableItem, "id" | "startAt" | "title">
): TimetableItem {
  return {
    endAt: null,
    note: null,
    createdAt: "2026-08-01T00:00:00+09:00",
    assignees: [],
    ...overrides
  };
}

describe("PlanTimetable", () => {
  const noopDelete = () => () => {};

  it("何も無いときは空の案内を出す", () => {
    render(<PlanTimetable items={[]} now={new Date("2026-08-15T12:00:00+09:00")} canEdit deleteAction={noopDelete} />);

    expect(screen.getByText(/まだ進行表はありません/)).toBeInTheDocument();
  });

  it("単日なら日付見出しを出さない", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.queryByTestId("timetable-date-heading")).not.toBeInTheDocument();
    // now は開始前なので、いまここは1つも出ない。光る側だけでなく光らない側も固定しておく。
    expect(screen.queryByText("▶ いまここ")).not.toBeInTheDocument();
  });

  it("複数日なら日付見出しを出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" }),
          timetableItem({ id: "b", startAt: "2026-08-16T09:00:00+09:00", title: "朝食" })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getAllByTestId("timetable-date-heading")).toHaveLength(2);
  });

  it("進行中の行にいまここを出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ"
          })
        ]}
        now={new Date("2026-08-15T14:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("▶ いまここ")).toBeInTheDocument();
  });

  it("分岐は分かれ目と合流の見出しで挟む", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "sea",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ",
            createdAt: "2026-08-01T00:00:00+09:00"
          }),
          timetableItem({
            id: "cafe",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T16:00:00+09:00",
            title: "カフェで休む",
            createdAt: "2026-08-01T00:01:00+09:00"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText(/二手に分かれる/)).toBeInTheDocument();
    expect(screen.getByText(/合流/)).toBeInTheDocument();
  });

  it("レーンが3つ以上なら横並びをやめて縦に積む", () => {
    const lanes = ["a", "b", "c"].map((id, index) =>
      timetableItem({
        id,
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        title: `班${id}`,
        createdAt: `2026-08-01T00:0${index}:00+09:00`,
        assignees: [{ participantId: `p${index}`, displayName: `担当${index}`, status: "confirmed" }]
      })
    );

    const { container } = render(
      <PlanTimetable items={lanes} now={new Date("2026-08-15T12:00:00+09:00")} canEdit={false} deleteAction={noopDelete} />
    );

    // jsdom は computed style を持たないのでクラス名で確認する（プロジェクトの作法）。
    const laneContainer = container.querySelector('[data-testid="timetable-lanes"]');
    expect(laneContainer?.className).toContain("grid-cols-1");
    expect(laneContainer?.className).not.toContain("sm:grid-cols-2");

    // クラス名（縦積みかどうか）だけを見ていると、見出し文言が実際のレーン数と
    // ずれていても検知できない。「二手に分かれる」固定だと3レーンでも同じ文言が出て
    // 事実と違う（見出しレビュー指摘）。文言自体もレーン数に応じて変わることを固定する。
    expect(screen.queryByText(/二手に分かれる/)).not.toBeInTheDocument();
    expect(screen.getByText(/3個に分かれる/)).toBeInTheDocument();
  });

  it("2レーンなら横に並べる", () => {
    const lanes = ["a", "b"].map((id, index) =>
      timetableItem({
        id,
        startAt: "2026-08-15T13:00:00+09:00",
        endAt: "2026-08-15T15:00:00+09:00",
        title: `班${id}`,
        createdAt: `2026-08-01T00:0${index}:00+09:00`,
        assignees: [{ participantId: `p${index}`, displayName: `担当${index}`, status: "confirmed" }]
      })
    );

    const { container } = render(
      <PlanTimetable items={lanes} now={new Date("2026-08-15T12:00:00+09:00")} canEdit={false} deleteAction={noopDelete} />
    );

    expect(container.querySelector('[data-testid="timetable-lanes"]')?.className).toContain("sm:grid-cols-2");
  });

  it("所要時間を出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T14:30:00+09:00",
            title: "海で泳ぐ"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("1時間30分")).toBeInTheDocument();
  });

  it("1時間未満は分だけで出す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T13:45:00+09:00",
            title: "移動"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("45分")).toBeInTheDocument();
  });

  it("ちょうどの時間は分を付けない", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("2時間")).toBeInTheDocument();
  });

  it("分岐中は複数の行が同時に光る", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "sea",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ",
            createdAt: "2026-08-01T00:00:00+09:00",
            assignees: [{ participantId: "p0", displayName: "担当0", status: "confirmed" }]
          }),
          timetableItem({
            id: "cafe",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T16:00:00+09:00",
            title: "カフェで休む",
            createdAt: "2026-08-01T00:01:00+09:00",
            assignees: [{ participantId: "p1", displayName: "担当1", status: "confirmed" }]
          })
        ]}
        now={new Date("2026-08-15T14:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    // 分岐中は「どちらの班も進行中」なので、1行に絞る実装だとここで落ちる。
    expect(screen.getAllByText("▶ いまここ")).toHaveLength(2);
  });

  it("辞退した担当は取り消し線と辞退バッジで残す", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            title: "受付",
            assignees: [{ participantId: "p3", displayName: "そら", status: "declined" }]
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("そら").className).toContain("line-through");
    expect(screen.getByText("辞退")).toBeInTheDocument();
  });

  it("参加を取り消した担当は取り消し線と取消バッジで残す（辞退とは文言を分ける）", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            title: "受付",
            assignees: [{ participantId: "p4", displayName: "みずき", status: "cancelled" }]
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByText("みずき").className).toContain("line-through");
    expect(screen.getByText("取消")).toBeInTheDocument();
    // 「辞退」は declined 専用の文言。cancelled にまで出ると取り消した人を辞退扱いしてしまう。
    expect(screen.queryByText("辞退")).not.toBeInTheDocument();
  });

  it("編集できないときは削除ボタンを出さない", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
      />
    );

    expect(screen.queryByRole("button", { name: "集合を削除" })).not.toBeInTheDocument();
  });

  it("編集できるときは削除ボタンを出す", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
      />
    );

    expect(screen.getByRole("button", { name: "集合を削除" })).toBeInTheDocument();
  });

  const editProps = {
    edit: {
      action: () => () => {},
      participants,
      // 単日だと <select name="date"> がそもそも描画されず、defaultDate の配線が
      // どのテストにも触れられなくなる（レビュー指摘）。複数日にしておく。
      eventDates: ["2026-08-15", "2026-08-16"]
    }
  };

  it("編集できるときは行ごとに編集の折りたたみを出す", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.getByText("編集")).toBeInTheDocument();
  });

  it("編集できないときは編集の折りたたみを出さない", () => {
    render(
      <PlanTimetable
        items={[timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit={false}
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.queryByText("編集")).not.toBeInTheDocument();
  });

  it("編集フォームには元の値が入っている", () => {
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "a",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T14:30:00+09:00",
            title: "海で泳ぐ",
            note: "日焼け止め",
            assignees: [{ participantId: "p1", displayName: "あかり", status: "confirmed" }]
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.getByLabelText("開始")).toHaveValue("13:00");
    expect(screen.getByLabelText("終了（任意）")).toHaveValue("14:30");
    expect(screen.getByLabelText("進行の名前")).toHaveValue("海で泳ぐ");
    expect(screen.getByLabelText("メモ（任意）")).toHaveValue("日焼け止め");
    // 担当は選択済みとしてチップが押された状態になっている。
    expect(screen.getByRole("button", { name: "あかり" })).toHaveAttribute("aria-pressed", "true");
  });

  it("行が2つあっても入力の id が衝突しない", () => {
    const { container } = render(
      <PlanTimetable
        items={[
          timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" }),
          timetableItem({ id: "b", startAt: "2026-08-15T14:00:00+09:00", title: "移動" })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    const ids = [...container.querySelectorAll('input[name="start_time"]')].map((input) => input.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("編集フォームの日付にはその行の日付が入っている", () => {
    // 期待値を eventDates の末尾と一致させないこと。一致させると
    // 「常に末尾を返す」実装（includes ガード無し）と区別がつかなくなる。
    render(
      <PlanTimetable
        items={[timetableItem({ id: "b", startAt: "2026-08-15T09:00:00+09:00", title: "朝食" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.getByLabelText("日付")).toHaveValue("2026-08-15");
  });

  it("行の日付が開催期間に無いときは末尾の日付にフォールバックする", () => {
    // 行を作った後に開催期間を短く確定し直した場合を想定。行の日付(17日)が
    // eventDates(15日・16日)のどの <option> にも無いと、素で defaultDate に渡すと
    // ブラウザが先頭(15日)を選び、保存時にその行が黙って15日へ移動してしまう。
    render(
      <PlanTimetable
        items={[timetableItem({ id: "c", startAt: "2026-08-17T09:00:00+09:00", title: "朝食" })]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    expect(screen.getByLabelText("日付")).toHaveValue("2026-08-16");
  });

  it("編集の入口には行のタイトルを含む aria-label が付き、行ごとに区別できる", () => {
    // 見た目のラベルは全行「編集」で同じなので、スクリーンリーダーが行を区別できるよう
    // 削除ボタンと同じ流儀（aria-label に行のタイトルを入れる）になっているか確かめる。
    const { container } = render(
      <PlanTimetable
        items={[
          timetableItem({ id: "a", startAt: "2026-08-15T13:00:00+09:00", title: "集合" }),
          timetableItem({ id: "b", startAt: "2026-08-15T14:00:00+09:00", title: "移動" })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    const ariaLabels = [...container.querySelectorAll("summary")].map((summary) =>
      summary.getAttribute("aria-label")
    );
    expect(ariaLabels).toEqual(["集合を編集", "移動を編集"]);
  });

  it("分岐中の行にも編集の折りたたみを出す", () => {
    // レーン内の TimetableRow にも edit が渡っているかの確認。canEdit={false} でしか
    // 分岐を描画しない既存テストだけだと、レーン側の受け渡しを消しても検知できない（レビュー指摘）。
    render(
      <PlanTimetable
        items={[
          timetableItem({
            id: "sea",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T15:00:00+09:00",
            title: "海で泳ぐ",
            createdAt: "2026-08-01T00:00:00+09:00"
          }),
          timetableItem({
            id: "cafe",
            startAt: "2026-08-15T13:00:00+09:00",
            endAt: "2026-08-15T16:00:00+09:00",
            title: "カフェで休む",
            createdAt: "2026-08-01T00:01:00+09:00"
          })
        ]}
        now={new Date("2026-08-15T12:00:00+09:00")}
        canEdit
        deleteAction={noopDelete}
        {...editProps}
      />
    );

    // このフィクスチャが本当に分岐ブロックになっていること自体も固定する。
    // single 2件に変わっても件数2は通ってしまい、レーン経路のカバレッジが黙って消える。
    expect(screen.getByText(/二手に分かれる/)).toBeInTheDocument();
    expect(screen.getAllByText("編集")).toHaveLength(2);
  });
});
