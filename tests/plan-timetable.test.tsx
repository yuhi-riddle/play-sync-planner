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
});
