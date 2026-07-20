import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push })
}));

import { AdjustmentMonthPicker } from "@/components/adjustment-month-picker";

describe("AdjustmentMonthPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces its local month after navigation and submits the new month", () => {
    const { rerender } = render(<AdjustmentMonthPicker currentMonth="2026-07" label="2026年7月" />);

    expect(screen.getByDisplayValue("2026-07")).toBeInTheDocument();
    rerender(<AdjustmentMonthPicker currentMonth="2026-08" label="2026年8月" />);

    expect(screen.queryByDisplayValue("2026-07")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button"));

    expect(push).toHaveBeenCalledWith("/plans?month=2026-08&date=2026-08-01", { scroll: false });
  });
});
