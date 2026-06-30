import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanForm } from "@/components/plan-form";

describe("PlanForm", () => {
  it("adds a candidate datetime and reaches the review step with a deadline", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    await waitFor(() => expect(screen.getByLabelText("開始時")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("開始時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("開始分"), { target: { value: "07" } });
    fireEvent.change(screen.getByLabelText("終了時"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("終了分"), { target: { value: "07" } });
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

    expect(screen.getByText("候補 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    expect(screen.getByRole("heading", { name: "回答期限を選ぶ" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/6月30日.*を選択/));
    await waitFor(() => expect(screen.getByLabelText("回答期限時")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("回答期限時"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("回答期限分"), { target: { value: "08" } });
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "共有リンクを作成" })).toBeEnabled();
    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-01T10:07");
    expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-01T12:07");
    expect(document.querySelector('input[name="answer_deadline_at"]')).toHaveAttribute("value", "2026-06-30T22:08");
  });

  it("blocks review when the answer deadline is after the first candidate", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    fireEvent.change(screen.getByLabelText("開始時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("開始分"), { target: { value: "00" } });
    fireEvent.change(screen.getByLabelText("終了時"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("終了分"), { target: { value: "00" } });
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    fireEvent.change(screen.getByLabelText("回答期限時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("回答期限分"), { target: { value: "01" } });
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByText("回答期限は最初の候補日時より前にしてください。")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "内容を確認する" })).not.toBeInTheDocument();
  });

  it("shows nazotoki template times", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventCategory="nazotoki" />);

    fireEvent.click(screen.getByRole("button", { name: "13:00〜" }));

    expect(screen.getByLabelText("開始時")).toHaveValue("13");
    expect(screen.getByLabelText("終了時")).toHaveValue("15");
  });

  it("adds a multi-day candidate by choosing a different end date", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    fireEvent.change(screen.getByLabelText("開始時"), { target: { value: "23" } });
    fireEvent.change(screen.getByLabelText("開始分"), { target: { value: "00" } });
    fireEvent.click(screen.getByRole("button", { name: "終了日を変更" }));
    fireEvent.click(within(screen.getByRole("group", { name: "終了日を選択" })).getByLabelText(/7月2日.*を選択/));
    fireEvent.change(screen.getByLabelText("終了時"), { target: { value: "01" } });
    fireEvent.change(screen.getByLabelText("終了分"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-01T23:00");
    expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-02T01:30");
  });

  it("adds an all-day candidate with an all-day hidden flag", () => {
    render(<PlanForm action={vi.fn()} submitLabel="蜈ｱ譛峨Μ繝ｳ繧ｯ繧剃ｽ懈・" />);

    const julyDateButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-label")?.includes("7月1日")) as HTMLElement;

    fireEvent.click(julyDateButton);
    fireEvent.click(screen.getByRole("checkbox", { name: "終日" }));
    const addButton = screen.getAllByRole("button").find((button) => button.textContent?.includes("候補")) as HTMLElement;
    fireEvent.click(addButton);

    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-01T00:00");
    expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-02T00:00");
    expect(document.querySelector('input[name="candidateAllDays"]')).toHaveAttribute("value", "true");
  });

  it("shows a settings link when Google Calendar is not connected", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" calendarAvailability={{ enabled: false }} />);

    expect(screen.getByRole("link", { name: "設定で連携する" })).toHaveAttribute("href", "/settings");
  });
});
