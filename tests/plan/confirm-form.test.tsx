import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmForm } from "@/components/plan/confirm-form";

vi.mock("@/lib/actions/confirm", () => ({
  confirmPlanAction: vi.fn()
}));

const candidates = [
  {
    id: "date-best",
    start_at: "2026-07-02T13:00:00+09:00",
    end_at: "2026-07-02T15:00:00+09:00",
    yes: 3,
    maybe: 1,
    no: 0,
    unanswered: 0,
    answered: 4,
    totalParticipants: 4,
    recommended: true,
    rank: 1,
    score: 10,
    hasPendingAnswers: false
  },
  {
    id: "date-pending",
    start_at: "2026-07-03T19:00:00+09:00",
    end_at: "2026-07-03T21:00:00+09:00",
    yes: 2,
    maybe: 0,
    no: 1,
    unanswered: 1,
    answered: 3,
    totalParticipants: 4,
    recommended: false,
    rank: 2,
    score: 4,
    hasPendingAnswers: true
  }
];

describe("ConfirmForm", () => {
  it("shows ranked candidates with recommendation and pending answer notice", () => {
    render(<ConfirmForm planId="plan-1" candidates={candidates} />);

    const rows = screen.getAllByRole("radio");
    expect(rows[0]).toHaveAttribute("value", "date-best");
    expect(rows[1]).toHaveAttribute("value", "date-pending");
    expect(screen.getByText("おすすめ")).toBeInTheDocument();
    expect(screen.getByText("未回答あり")).toBeInTheDocument();
    expect(screen.getByText("スコア 10")).toBeInTheDocument();
    expect(screen.getByText("スコア 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "選んだ日程で確定する" })).toBeInTheDocument();
  });

  it("shows answer counts for each candidate", () => {
    render(<ConfirmForm planId="plan-1" candidates={candidates} />);

    const bestCandidate = screen.getByLabelText("1位の候補 date-best").closest("label");
    expect(bestCandidate).not.toBeNull();

    const scope = within(bestCandidate as HTMLElement);
    expect(scope.getByLabelText("○ 3")).toBeInTheDocument();
    expect(scope.getByLabelText("△ 1")).toBeInTheDocument();
    expect(scope.getByLabelText("× 0")).toBeInTheDocument();
    expect(scope.getByLabelText("未 0")).toBeInTheDocument();
  });

  it("opens an in-app confirmation dialog instead of the browser confirm dialog", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ConfirmForm planId="plan-1" candidates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "選んだ日程で確定する" }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "日程を確定しますか？" })).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
