import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ParticipantToggleChips } from "@/components/participant-toggle-chips";
import { PlanTimetableForm } from "@/components/plan-timetable-form";

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

  it("開始時刻には最後の行の1時間後が入っている", () => {
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
});
