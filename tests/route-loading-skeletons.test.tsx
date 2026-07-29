import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import HomeLoading from "@/app/loading";
import EventLoading from "@/app/events/[eventId]/loading";
import PlanLoading from "@/app/plans/[planId]/loading";
import SettlementLoading from "@/app/plans/[planId]/settlement/loading";

describe("ルートごとの読み込み中スケルトン", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it.each([
    ["ホーム", HomeLoading],
    ["イベント詳細", EventLoading],
    ["日程調整詳細", PlanLoading],
    ["清算", SettlementLoading]
  ])("%sのローディングは読み込み中であることを伝える", (_label, Loading) => {
    render(<Loading />);

    expect(screen.getByRole("status", { name: "読み込み中" })).toBeInTheDocument();
  });

  // 実ページ（Card構成）に寄せて、小さすぎるスケルトンによる唐突な体感を防ぐ。
  it.each([
    ["ホーム", HomeLoading, 7, 2],
    ["イベント詳細", EventLoading, 9, 3],
    ["日程調整詳細", PlanLoading, 10, 3],
    ["清算", SettlementLoading, 10, 3]
  ])("%sのローディングは実ページの構造に見合うCardとSkeletonの数を描く", (_label, Loading, minSkeletons, minCards) => {
    const { container } = render(<Loading />);

    const skeletonCount = container.querySelectorAll('[aria-hidden="true"]').length;
    const cardCount = container.querySelectorAll("section").length;

    expect(skeletonCount).toBeGreaterThanOrEqual(minSkeletons);
    expect(cardCount).toBeGreaterThanOrEqual(minCards);
  });
});
