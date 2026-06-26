import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PlanForm } from "@/components/plan-form";

describe("PlanForm", () => {
  it("adds a candidate datetime and reaches the review step with a deadline", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.change(screen.getByLabelText("選択中の日付"), { target: { value: "2026-07-01" } });
    fireEvent.change(screen.getByLabelText("時"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("分"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

    expect(screen.getByText("候補 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    expect(screen.getByRole("heading", { name: "回答期限を選ぶ" })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("選択中の日付"), { target: { value: "2026-06-30" } });
    fireEvent.change(screen.getByLabelText("時"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("分"), { target: { value: "00" } });
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "共有リンクを作成" })).toBeEnabled();
    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-01T10:15");
    expect(document.querySelector('input[name="answer_deadline_at"]')).toHaveAttribute("value", "2026-06-30T22:00");
  });
});
