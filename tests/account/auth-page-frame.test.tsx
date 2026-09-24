import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AuthPageFrame } from "@/components/account/auth-page-frame";

vi.stubGlobal("React", React);

describe("AuthPageFrame", () => {
  // 中身の少ないログイン・同意画面で、余った高さを上下に分け、PCでは横も真ん中に寄せる
  it("centers its content vertically and, on wide screens, horizontally", () => {
    render(
      <AuthPageFrame>
        <p>中身</p>
      </AuthPageFrame>
    );

    const column = screen.getByText("中身").parentElement!;
    expect(column).toHaveClass("mx-auto", "w-full", "max-w-xl");
    expect(column.parentElement).toHaveClass("flex", "flex-1", "flex-col", "justify-center");
  });

  it.each(["app/login/page.tsx", "app/consent/page.tsx"])("is used by %s", (file) => {
    const page = readFileSync(resolve(process.cwd(), file), "utf8");

    expect(page).toContain("<AuthPageFrame>");
  });
});
