import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("輪をタップすると一発でその時刻にジャンプする（時モード・外側）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const ring = screen.getByTestId("time-dial-ring");

    // 90度・外側リング半径(輪の縁寄り)をタップ = 3時。ドラッグ開始なしで即座に反映される。
    fireEvent.pointerDown(ring, { clientX: 90 + 60, clientY: 90 });

    expect(onTimeChange).toHaveBeenLastCalledWith("03:00");
  });

  it("ハンドルをドラッグすると時刻が変わる（時モード）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const handle = screen.getByRole("slider", { name: "開始のつまみ" });

    fireEvent.pointerDown(handle);
    // 90度・外側リング半径60をドラッグ先に = 3時。
    fireEvent.pointerMove(window, { clientX: 90 + 60, clientY: 90 });
    fireEvent.pointerUp(window);

    expect(onTimeChange).toHaveBeenLastCalledWith("03:00");
  });

  it("輪の中心寄りをタップすると内側リング(13〜23・00)の時刻が選ばれる（時モード）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, width: 180, height: 180, top: 0, left: 0, right: 180, bottom: 180, toJSON: () => ({})
    } as DOMRect);
    const ring = screen.getByTestId("time-dial-ring");

    // 90度・内側リング半径(中心寄り)をタップ = 15時。
    fireEvent.pointerDown(ring, { clientX: 90 + 34, clientY: 90 });

    expect(onTimeChange).toHaveBeenLastCalledWith("15:00");
  });

  it("外側の1〜12と、内側の主要4つ(00・15・18・21)が常に数字として表示される（時モード）", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    for (const outerValue of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
      expect(within(svg).getByText(String(outerValue))).toBeInTheDocument();
    }
    for (const innerValue of ["00", "15", "18", "21"]) {
      expect(within(svg).getByText(innerValue)).toBeInTheDocument();
    }
    // 主要でない内側の値(例: 14時)は選択されていない間は表示されない。
    expect(within(svg).queryByText("14")).not.toBeInTheDocument();
  });

  it("選択中の時刻が、主要でない内側の位置でも数字として表示される（時モード）", () => {
    render(<TimeDialPicker time="14:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 14:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    expect(within(svg).getByText("14")).toBeInTheDocument();
  });

  it("つまみにフォーカスして矢印キーで時刻を変えられる（時モード）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:00" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const handle = screen.getByRole("slider", { name: "開始のつまみ" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(onTimeChange).toHaveBeenLastCalledWith("20:00");
  });

  it("つまみにフォーカスして矢印キーで時刻を変えられる（分モード、5分刻み）", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="19:05" onTimeChange={onTimeChange} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:05" }));
    fireEvent.click(screen.getByRole("button", { name: "05" }));

    const handle = screen.getByRole("slider", { name: "開始のつまみ" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onTimeChange).toHaveBeenLastCalledWith("19:10");

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onTimeChange).toHaveBeenLastCalledWith("19:00");
  });

  it("optional かつ未設定のとき「+ ○○を設定」ボタンを出し、押すと展開する", () => {
    const onTimeChange = vi.fn();
    render(<TimeDialPicker time="" onTimeChange={onTimeChange} label="終了" fieldLabel="終了" optional onClear={vi.fn()} />);

    const setButton = screen.getByRole("button", { name: "+ 終了を設定" });
    expect(screen.queryByRole("slider", { name: "終了のつまみ" })).not.toBeInTheDocument();

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

  /*
   * SVGの<text>/強調用<circle>はデフォルトで pointer-events: visiblePainted のため、
   * pointer-events-none を付け忘れるとタップ判定を持つリング(円)より手前でイベントを
   * 奪ってしまい、数字ちょうどをタップしても何も起きない(実機でのみ再現する不具合だった。
   * fireEvent は要素を直接指定してイベントを発火するため、実ブラウザのようなヒットテスト
   * による奪い合いは再現できず、代わりにクラス名を直接検証する)。
   */
  it("時モードの数字・強調円・針が pointer-events-none で、タップ判定を奪わない", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));

    const svg = screen.getByTestId("time-dial-svg");
    const unselectedLabel = within(svg).getByText("3");
    expect(unselectedLabel).toHaveClass("pointer-events-none");
    // 19時は内側リング(13〜23・00)側の選択中の数字として表示される。
    const selectedLabel = within(svg).getByText("19");
    expect(selectedLabel).toHaveClass("pointer-events-none");
  });

  it("分モードの数字・強調円が pointer-events-none で、タップ判定を奪わない", () => {
    render(<TimeDialPicker time="19:00" onTimeChange={vi.fn()} label="開始" fieldLabel="開始" />);
    fireEvent.click(screen.getByRole("button", { name: "開始 19:00" }));
    fireEvent.click(screen.getByRole("button", { name: "00" }));

    const svg = screen.getByTestId("time-dial-svg");
    const selectedLabel = within(svg).getByText("00");
    expect(selectedLabel).toHaveClass("pointer-events-none");
  });
});
