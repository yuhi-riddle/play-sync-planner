import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DailyBusyTimelineBar } from "@/components/plan/daily-busy-timeline-bar";

describe("DailyBusyTimelineBar", () => {
  it("区分ごとに、予定なし/一人/複数人のトーンを塗り分ける", () => {
    render(<DailyBusyTimelineBar segments={[0, 1, 2, 0, 1, 2]} />);

    const bars = screen.getAllByTestId("timeline-segment");
    expect(bars).toHaveLength(6);
    expect(bars[0].className).not.toContain("skywash");
    expect(bars[1].className).toContain("bg-skywash/45");
    expect(bars[2].className).toContain("bg-skywash/85");
    expect(bars[4].className).toContain("bg-skywash/45");
    expect(bars[5].className).toContain("bg-skywash/85");
  });

  it("4時間区切りの時刻ラベルを表示する", () => {
    render(<DailyBusyTimelineBar segments={[0, 0, 0, 0, 0, 0]} />);

    for (const label of ["0", "4", "8", "12", "16", "20", "24"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("4時間ごとの予定人数を読み上げられる要約にする", () => {
    render(<DailyBusyTimelineBar segments={[0, 1, 2, 3, 0, 1]} />);

    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "0時〜4時は予定なし、4時〜8時は1人が予定あり、8時〜12時は2人が予定あり、12時〜16時は3人が予定あり、16時〜20時は予定なし、20時〜24時は1人が予定あり"
    );
  });

  it("色の濃さが表す予定人数の凡例を表示する", () => {
    render(<DailyBusyTimelineBar segments={[0, 0, 0, 0, 0, 0]} />);

    expect(screen.getByText("薄い色＝1人、濃い色＝複数人が重なっている")).toBeInTheDocument();
  });
});
