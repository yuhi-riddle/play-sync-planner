import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

import { AdjustmentMonthPicker } from "@/components/plan/adjustment-month-picker";

describe("AdjustmentMonthPicker", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("OS 標準の month input を使わない", () => {
    const { container } = render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);
    expect(container.querySelector('input[type="month"]')).toBeNull();
  });

  it("年ボタンと12ヶ月グリッドを出す", () => {
    render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);
    // 年（当年 ±3 = 2023..2029、vitest.setup の now=2026-07-01）
    expect(screen.getByRole("button", { name: "2026年" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2029年" })).toBeInTheDocument();
    // 月
    for (const m of ["1月", "6月", "12月"]) {
      expect(screen.getByRole("button", { name: m })).toBeInTheDocument();
    }
  });

  it("月をタップすると /plans?month=YYYY-MM&date=YYYY-MM-01 に push する", () => {
    render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);

    fireEvent.click(screen.getByRole("button", { name: "3月" }));

    expect(push).toHaveBeenCalledWith("/plans?month=2026-03&date=2026-03-01", { scroll: false });
  });

  it("年を変えてから月をタップすると、その年月に push する", () => {
    render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);

    fireEvent.click(screen.getByRole("button", { name: "2028年" }));
    fireEvent.click(screen.getByRole("button", { name: "11月" }));

    expect(push).toHaveBeenCalledWith("/plans?month=2028-11&date=2028-11-01", { scroll: false });
  });
});
