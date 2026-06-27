import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanForm } from "@/components/plan-form";

describe("PlanForm", () => {
  it("adds a candidate datetime and reaches the review step with a deadline", async () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    await waitFor(() => expect(screen.getByLabelText("時")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("分"), { target: { value: "07" } });
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

    expect(screen.getByText("候補 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    expect(screen.getByRole("heading", { name: "回答期限を選ぶ" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/6月30日.*を選択/));
    await waitFor(() => expect(screen.getByLabelText("時")).toHaveFocus());
    fireEvent.change(screen.getByLabelText("時"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("分"), { target: { value: "08" } });
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "共有リンクを作成" })).toBeEnabled();
    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-01T10:07");
    expect(document.querySelector('input[name="answer_deadline_at"]')).toHaveAttribute("value", "2026-06-30T22:08");
  });

  it("blocks review when the answer deadline is after the first candidate", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    fireEvent.change(screen.getByLabelText("時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("分"), { target: { value: "00" } });
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    fireEvent.click(screen.getByLabelText(/7月1日.*を選択/));
    fireEvent.change(screen.getByLabelText("時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("分"), { target: { value: "01" } });
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByText("回答期限は最初の候補日時より前にしてください。")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "内容を確認する" })).not.toBeInTheDocument();
  });
});
