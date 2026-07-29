import React from "react";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import GlobalError from "@/app/global-error";

describe("GlobalError", () => {
  const originalError = console.error;

  beforeEach(() => {
    vi.stubGlobal("React", React);
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("原因をconsole.errorに残す", () => {
    const error = Object.assign(new Error("root layout crashed"), { digest: "xyz789" });

    render(<GlobalError error={error} reset={vi.fn()} />);

    expect(console.error).toHaveBeenCalledWith(error);
  });

  it("digestを表示する", () => {
    const error = Object.assign(new Error("root layout crashed"), { digest: "xyz789" });

    render(<GlobalError error={error} reset={vi.fn()} />);

    expect(screen.getByText(/xyz789/)).toBeInTheDocument();
  });
});
