import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EventErrorPage from "@/app/events/[eventId]/error";
import PlanErrorPage from "@/app/plans/[planId]/error";
import PublicShareErrorPage from "@/app/s/[token]/error";

describe("セグメント単位のエラー境界", () => {
  const originalError = console.error;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("イベント詳細のエラーは原因をログに残し、イベント一覧へ戻れる", () => {
    const error = Object.assign(new Error("boom"), { digest: "evt-1" });
    render(<EventErrorPage error={error} reset={vi.fn()} />);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(screen.getByText(/evt-1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /イベント一覧/ })).toHaveAttribute("href", "/events");
  });

  it("日程調整のエラーは原因をログに残し、日程調整一覧へ戻れる", () => {
    const error = Object.assign(new Error("boom"), { digest: "plan-1" });
    render(<PlanErrorPage error={error} reset={vi.fn()} />);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(screen.getByText(/plan-1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /日程調整一覧/ })).toHaveAttribute("href", "/plans");
  });

  it("公開共有ページのエラーは原因をログに残し、戻り先を提示しない", () => {
    const error = Object.assign(new Error("boom"), { digest: "share-1" });
    render(<PublicShareErrorPage error={error} reset={vi.fn()} />);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(screen.getByText(/share-1/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
