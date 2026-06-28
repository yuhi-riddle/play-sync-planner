import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AnswerForm } from "@/components/answer-form";

vi.mock("@/lib/actions/answers", () => ({
  submitAvailabilityAnswersAction: vi.fn()
}));

const candidates = [
  {
    id: "date-1",
    start_at: "2026-07-01T10:00:00+09:00",
    end_at: "2026-07-01T12:00:00+09:00"
  },
  {
    id: "date-2",
    start_at: "2026-07-02T13:00:00+09:00",
    end_at: "2026-07-02T15:00:00+09:00"
  }
];

describe("AnswerForm", () => {
  it("shows answer progress and disables submit until all candidates are answered", () => {
    render(<AnswerForm token="token-1" candidateDates={candidates} />);

    expect(screen.getByText("回答済み 0/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答する" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("候補1に行けると回答"));
    expect(screen.getByText("回答済み 1/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答する" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("候補2に行けないと回答"));
    expect(screen.getByText("回答済み 2/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答する" })).toBeEnabled();
  });

  it("can apply one answer to every candidate", () => {
    render(<AnswerForm token="token-1" candidateDates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "全部△" }));

    expect(screen.getByText("回答済み 2/2")).toBeInTheDocument();
    expect(screen.getByLabelText("候補1に調整できるかもと回答")).toBeChecked();
    expect(screen.getByLabelText("候補2に調整できるかもと回答")).toBeChecked();
    expect(screen.getByRole("button", { name: "回答する" })).toBeEnabled();
  });
});
