import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnswerForm, CALENDAR_NOTICE_MIN_HEIGHT_CLASS, CANDIDATE_WARNING_MIN_HEIGHT_CLASS } from "@/components/answer-form";

const { loadPreviousAnswersAction } = vi.hoisted(() => ({ loadPreviousAnswersAction: vi.fn() }));

vi.mock("@/lib/actions/answers", () => ({
  submitAvailabilityAnswersAction: vi.fn(),
  loadPreviousAnswersAction
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

beforeEach(() => {
  vi.clearAllMocks();
  loadPreviousAnswersAction.mockResolvedValue({ found: false });
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

  it("keeps the calendar notice container present with the same minimum height in idle, loading, and ready states", async () => {
    // idle: 候補が空だと月が確定できず calendarState は idle のまま
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { unmount: unmountIdle } = render(<AnswerForm token="token-1" candidateDates={[]} />);
    const idleNotice = screen.getByTestId("calendar-notice");
    expect(idleNotice).toHaveClass(CALENDAR_NOTICE_MIN_HEIGHT_CLASS);
    expect(idleNotice.textContent).toBe("");
    unmountIdle();

    // loading: fetch がまだ解決していない
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { unmount: unmountLoading } = render(<AnswerForm token="token-1" candidateDates={candidates} />);
    const loadingNotice = screen.getByTestId("calendar-notice");
    expect(loadingNotice).toHaveClass(CALENDAR_NOTICE_MIN_HEIGHT_CLASS);
    expect(loadingNotice.textContent).toBe("Google Calendarを確認中です。");
    unmountLoading();

    // ready: fetch が connected: true で解決する
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ connected: true, busy: [] })
      })
    );
    render(<AnswerForm token="token-1" candidateDates={candidates} />);
    const readyNotice = screen.getByTestId("calendar-notice");
    expect(readyNotice).toHaveClass(CALENDAR_NOTICE_MIN_HEIGHT_CLASS);
    await waitFor(() => {
      expect(readyNotice.textContent).toBe("");
    });
  });

  describe("前回の回答", () => {
    const previous = {
      found: true,
      participantName: "たろう",
      answers: {
        "date-1": { answer: "yes", comment: "昼からなら" },
        "date-2": { answer: "no", comment: "" }
      }
    };

    function renderForm() {
      vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
      render(<AnswerForm token="token-1" candidateDates={candidates} />);
    }

    function typeName(name: string) {
      const field = screen.getByLabelText("名前");
      fireEvent.input(field, { target: { value: name } });
      fireEvent.blur(field);
    }

    it("名前を入れると前回の回答を引いて、そのまま当てる", async () => {
      loadPreviousAnswersAction.mockResolvedValue(previous);
      renderForm();

      typeName("たろう");

      expect(await screen.findByText("たろうさんの前回の回答を読み込みました。変えたいところだけ直してください。")).toBeInTheDocument();
      expect(screen.getByLabelText("候補1に行けると回答")).toBeChecked();
      expect(screen.getByLabelText("候補2に行けないと回答")).toBeChecked();
      expect(screen.getByText("回答済み 2/2")).toBeInTheDocument();
      expect(loadPreviousAnswersAction).toHaveBeenCalledWith("token-1", "たろう");
    });

    it("前回のコメントも戻す", async () => {
      // 回答だけ戻すと、コメントが空のまま送られて前回の内容が消える
      loadPreviousAnswersAction.mockResolvedValue(previous);
      renderForm();

      typeName("たろう");

      await screen.findByText(/前回の回答を読み込みました/);
      const comments = screen.getAllByRole("textbox").filter((field) => field.getAttribute("name")?.startsWith("comment:"));
      expect(comments[0]).toHaveValue("昼からなら");
      expect(comments[1]).toHaveValue("");
    });

    it("入力中の回答は黙って上書きしない", async () => {
      loadPreviousAnswersAction.mockResolvedValue(previous);
      renderForm();

      fireEvent.click(screen.getByLabelText("候補1に調整できるかもと回答"));
      typeName("たろう");

      expect(await screen.findByText("たろうさんの前回の回答があります。")).toBeInTheDocument();
      expect(screen.getByLabelText("候補1に調整できるかもと回答")).toBeChecked();
      expect(screen.getByLabelText("候補1に行けると回答")).not.toBeChecked();
    });

    it("押せば入力中の回答に上書きする", async () => {
      loadPreviousAnswersAction.mockResolvedValue(previous);
      renderForm();

      fireEvent.click(screen.getByLabelText("候補1に調整できるかもと回答"));
      typeName("たろう");

      fireEvent.click(await screen.findByRole("button", { name: "前回の回答を読み込む" }));

      expect(screen.getByLabelText("候補1に行けると回答")).toBeChecked();
      expect(screen.queryByText("たろうさんの前回の回答があります。")).not.toBeInTheDocument();
    });

    it("初めての人には何も出さない", async () => {
      loadPreviousAnswersAction.mockResolvedValue({ found: false });
      renderForm();

      typeName("はなこ");

      await waitFor(() => {
        expect(loadPreviousAnswersAction).toHaveBeenCalled();
      });
      expect(screen.queryByText(/前回の回答/)).not.toBeInTheDocument();
      expect(screen.getByText("回答済み 0/2")).toBeInTheDocument();
    });

    it("名前が変わっていなければ引き直さない", async () => {
      loadPreviousAnswersAction.mockResolvedValue(previous);
      renderForm();

      typeName("たろう");
      await screen.findByText(/前回の回答を読み込みました/);

      // 候補を選ぶたびに名前欄を出入りするので、blur ごとに叩くと無駄打ちになる
      fireEvent.blur(screen.getByLabelText("名前"));

      expect(loadPreviousAnswersAction).toHaveBeenCalledTimes(1);
    });

    it("名前が空なら引かない", () => {
      renderForm();

      typeName("   ");

      expect(loadPreviousAnswersAction).not.toHaveBeenCalled();
    });
  });

  it("reserves a placeholder slot per candidate while Google Calendar conflicts are still loading", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<AnswerForm token="token-1" candidateDates={candidates} />);

    const placeholders = Array.from(container.querySelectorAll("div")).filter((element) =>
      element.classList.contains(CANDIDATE_WARNING_MIN_HEIGHT_CLASS)
    );
    expect(placeholders).toHaveLength(candidates.length);
  });
});
