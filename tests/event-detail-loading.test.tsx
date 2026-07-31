import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Loading from "@/app/events/[eventId]/loading";

describe("イベント詳細の読み込み中表示", () => {
  it("読み込み中であることを伝える", () => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "読み込み中" })).toBeInTheDocument();
  });

  // タブを切り替えるたびに loading.tsx が挟まる。タブバーの位置がずれると
  // 切り替えのたびに画面が跳ねるため、実物と同じ4枠を同じ高さで置いておく。
  it("タブバーの位置を確保する", () => {
    const { container } = render(<Loading />);
    const tabBar = container.querySelector('[data-testid="event-tab-skeleton"]');

    expect(tabBar).toBeInTheDocument();
    expect(tabBar?.children).toHaveLength(4);
  });
});
