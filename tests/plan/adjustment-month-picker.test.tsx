import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

import { AdjustmentMonthPicker } from "@/components/plan/adjustment-month-picker";

function renderPicker(
  currentMonth = "2026-07",
  currentYear = 2026,
  onNavigatingChange?: (pending: boolean) => void
) {
  return render(
    <AdjustmentMonthPicker
      currentMonth={currentMonth}
      currentYear={currentYear}
      label="2026年7月"
      onNavigatingChange={onNavigatingChange}
    />
  );
}

describe("AdjustmentMonthPicker", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("OS 標準の month input を使わない", () => {
    const { container } = renderPicker();
    expect(container.querySelector('input[type="month"]')).toBeNull();
  });

  it("年ボタンと12ヶ月グリッドを出す", () => {
    renderPicker();
    // 年（当年 ±3 = 2023..2029）
    expect(screen.getByRole("button", { name: "2026年" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2029年" })).toBeInTheDocument();
    // 月
    for (const m of ["1月", "6月", "12月"]) {
      expect(screen.getByRole("button", { name: m })).toBeInTheDocument();
    }
  });

  it("月をタップすると /plans?month=YYYY-MM&date=YYYY-MM-01 に push する", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "3月" }));

    expect(push).toHaveBeenCalledWith("/plans?month=2026-03&date=2026-03-01", { scroll: false });
  });

  it("年を変えてから月をタップすると、その年月に push する", () => {
    renderPicker();

    fireEvent.click(screen.getByRole("button", { name: "2028年" }));
    fireEvent.click(screen.getByRole("button", { name: "11月" }));

    expect(push).toHaveBeenCalledWith("/plans?month=2028-11&date=2028-11-01", { scroll: false });
  });

  it("月をタップするとパネル（details）を閉じる", () => {
    const { container } = renderPicker();
    const details = container.querySelector("details") as HTMLDetailsElement;
    details.open = true;

    fireEvent.click(screen.getByRole("button", { name: "5月" }));

    expect(details.open).toBe(false);
  });

  it("選択中の年ボタン自体をbg-mistでハイライトする（固定位置の帯には頼らない）", () => {
    renderPicker();

    expect(screen.getByRole("button", { name: "2026年" })).toHaveClass("bg-mist");
    expect(screen.getByRole("button", { name: "2027年" })).not.toHaveClass("bg-mist");

    fireEvent.click(screen.getByRole("button", { name: "2027年" }));

    expect(screen.getByRole("button", { name: "2027年" })).toHaveClass("bg-mist");
    expect(screen.getByRole("button", { name: "2026年" })).not.toHaveClass("bg-mist");
  });

  it("月をタップした瞬間に onNavigatingChange(true) を呼ぶ", () => {
    const onNavigatingChange = vi.fn();
    renderPicker("2026-07", 2026, onNavigatingChange);

    fireEvent.click(screen.getByRole("button", { name: "3月" }));

    expect(onNavigatingChange).toHaveBeenCalledWith(true);
  });

  it("currentMonth が変わったら onNavigatingChange(false) を呼ぶ", () => {
    const onNavigatingChange = vi.fn();
    const { rerender } = renderPicker("2026-07", 2026, onNavigatingChange);

    fireEvent.click(screen.getByRole("button", { name: "3月" }));
    onNavigatingChange.mockClear();

    rerender(
      <AdjustmentMonthPicker
        currentMonth="2026-03"
        currentYear={2026}
        label="2026年3月"
        onNavigatingChange={onNavigatingChange}
      />
    );

    expect(onNavigatingChange).toHaveBeenCalledWith(false);
  });

  it("年ボタンは aria-pressed で選択状態を示す", () => {
    renderPicker();
    expect(screen.getByRole("button", { name: "2026年" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "2027年" }));

    expect(screen.getByRole("button", { name: "2027年" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "2026年" })).toHaveAttribute("aria-pressed", "false");
  });
});
