import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanForm } from "@/components/plan-form";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PlanForm group availability", () => {
  it("shows anonymous group availability while selecting a candidate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          month: "2026-07",
          updatedAt: "2026-07-01T00:00:00Z",
          participantCount: 2,
          slots: [
            { start: "2026-07-15T10:00:00+09:00", end: "2026-07-15T10:15:00+09:00", availableCount: 2 },
            { start: "2026-07-15T10:15:00+09:00", end: "2026-07-15T10:30:00+09:00", availableCount: 1 }
          ]
        })
      }))
    );

    render(<PlanForm action={vi.fn()} submitLabel="作成" eventId="event-1" calendarAvailability={{ enabled: true }} />);

    expect(await screen.findByText("参加者全体の空きやすさ")).toBeInTheDocument();
    expect(await screen.findByLabelText(/平均 空き 1.5\/2人/)).toBeInTheDocument();
  });
});
