import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimeDialPicker } from "@/components/plan/time-dial-picker";

describe("TimeDialPicker", () => {
  it("表示は閉じたチップだけで、時刻がラベルに出る", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);

    expect(screen.getByRole("button", { name: "開始 19:00" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "19" })).not.toBeInTheDocument();
  });

  it("チップをタップすると時計が展開し、もう一度で閉じる", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);

    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));
    expect(screen.getByRole("button", { name: "19" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "00" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));
    expect(screen.queryByRole("button", { name: "19" })).not.toBeInTheDocument();
  });

  it("時/分の数字ボタンでモードが切り替わる", () => {
    render(<TimeDialPicker time="19:05" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:05" }));

    const hourButton = screen.getByRole("button", { name: "19" });
    const minuteButton = screen.getByRole("button", { name: "05" });
    expect(hourButton).toHaveAttribute("aria-pressed", "true");
    expect(minuteButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(minuteButton);
    expect(hourButton).toHaveAttribute("aria-pressed", "false");
    expect(minuteButton).toHaveAttribute("aria-pressed", "true");
  });

  it("ハンドルをドラッグすると時刻が変わる（時モード）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const handle = screen.getByRole("button", { name: "開始のつまみ" });

    fireEvent.pointerDown(handle);
    // 90度（時計回りに6時方向）= 6時。ローカル座標 (90+72, 90) = (162, 90)
    fireEvent.pointerMove(window, { clientX: 162, clientY: 90 });
    fireEvent.pointerUp(window);

    expect(onTimeChange).toHaveBeenLastCalledWith("06:00");
  });

  it("optional かつ未設定のとき「+ ○○を設定」ボタンを出し、押すと展開する", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="" onTimeChange={onTimeChange} label="終了" fieldLabel="終了" optional onClear={vi.fn()} />);

    const setButton = screen.getByRole("button", { name: "+ 終了を設定" });
    expect(screen.queryByRole("button", { name: "終了のつまみ" })).not.toBeInTheDocument();

    fireEvent.click(setButton);
    expect(onTimeChange).toHaveBeenCalledWith("20:00");
  });

  it("未設定に戻すを押すと onClear が呼ばれる", () => {
    const onClear = vi.fn();
    render(<TimeDialPicker time="20:00" onTimeChange={vi.fn()} label="終了" fieldLabel="終了" optional onClear={onClear} />);

    fireEvent.click(screen.getByRole("button", { name: "終了 20:00" }));
    fireEvent.click(screen.getByRole("button", { name: "未設定に戻す" }));

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
