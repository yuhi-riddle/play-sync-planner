import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ErrorPage from "@/app/error";

describe("ErrorPage", () => {
  const originalError = console.error;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("原因をconsole.errorに残す(ユーザーには出さない)", () => {
    const error = Object.assign(new Error("internal supabase failure"), { digest: "abc123" });

    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(console.error).toHaveBeenCalledWith(error);
    expect(screen.queryByText(/internal supabase failure/)).not.toBeInTheDocument();
  });

  it("問い合わせ時に突き合わせられるよう、digestを小さく表示する", () => {
    const error = Object.assign(new Error("internal supabase failure"), { digest: "abc123" });

    render(<ErrorPage error={error} reset={vi.fn()} />);

    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it("digestが無いときは何も表示しない", () => {
    render(<ErrorPage error={new Error("boom")} reset={vi.fn()} />);

    expect(screen.queryByText(/エラーコード/)).not.toBeInTheDocument();
  });
});
