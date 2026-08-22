import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PageHeader } from "@/components/ui/server";

describe("PageHeader", () => {
  it("renders the icon slot next to the title when icon is passed", () => {
    render(<PageHeader title="夏合宿 前泊なし案" icon={<span data-testid="header-icon">icon</span>} />);

    expect(screen.getByTestId("header-icon")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "夏合宿 前泊なし案" })).toBeInTheDocument();
  });

  it("renders nothing extra when icon is omitted (existing callers unaffected)", () => {
    const { container } = render(<PageHeader title="設定" />);

    expect(container.querySelectorAll("[data-testid='header-icon']").length).toBe(0);
    expect(screen.getByRole("heading", { name: "設定" })).toBeInTheDocument();
  });
});
