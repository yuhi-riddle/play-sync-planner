import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnswerForm", () => {
  it("shows answer progress and disables submit until all candidates are answered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ connected: false, busy: [] })
      })
    );
    render(<AnswerForm token="token-1" candidateDates={candidates} />);

    expect(screen.getByText("回答済み 0/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答する" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("候補1に行けると回答"));
    expect(screen.getByText("回答済み 1/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答する" })).toBeDisabled();

    fireEvent.click(screen.getByLabelText("候補2に行けないと回答"));
    expect(screen.getByText("回答済み 2/2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "回答する" })).toBeEnabled();

    await waitFor(() => {
      expect(screen.getByText("Google Calendar未連携のため、候補日の重なり確認は表示していません。")).toBeInTheDocument();
    });
  });

  it("shows a help message about remaining answers and hides it once all are answered", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<AnswerForm token="token-1" candidateDates={candidates} />);

    expect(screen.getByText("残り2件の候補に回答すると送信できます。")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("候補1に行けると回答"));
    expect(screen.getByText("残り1件の候補に回答すると送信できます。")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("候補2に行けないと回答"));
    expect(screen.queryByText(/件の候補に回答すると送信できます。/)).not.toBeInTheDocument();
  });

  it("can apply one answer to every candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ connected: false, busy: [] })
      })
    );
    render(<AnswerForm token="token-1" candidateDates={candidates} />);

    fireEvent.click(screen.getByRole("button", { name: "全部△" }));

    expect(screen.getByText("回答済み 2/2")).toBeInTheDocument();
    expect(screen.getByLabelText("候補1に調整できるかもと回答")).toBeChecked();
    expect(screen.getByLabelText("候補2に調整できるかもと回答")).toBeChecked();
    expect(screen.getByRole("button", { name: "回答する" })).toBeEnabled();

    await waitFor(() => {
      expect(screen.getByText("Google Calendar未連携のため、候補日の重なり確認は表示していません。")).toBeInTheDocument();
    });
  });

  it("shows Google Calendar events that overlap with a candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          connected: true,
          busy: [
            {
              start: "2026-07-01T11:00:00+09:00",
              end: "2026-07-01T11:30:00+09:00",
              title: "歯医者",
              location: "新宿"
            }
          ]
        })
      })
    );

    render(<AnswerForm token="token-1" candidateDates={candidates} />);

    await waitFor(() => {
      expect(screen.getByText("Google予定と重なっています")).toBeInTheDocument();
    });
    expect(screen.getByText("歯医者")).toBeInTheDocument();
    expect(screen.getByText("新宿")).toBeInTheDocument();
  });
});
