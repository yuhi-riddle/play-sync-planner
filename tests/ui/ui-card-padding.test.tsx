import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "@/components/ui/server";

describe("Card の余白", () => {
  it("既定は p-5", () => {
    const { container } = render(<Card>本文</Card>);
    const section = container.querySelector("section") as HTMLElement;

    expect(section).toHaveClass("p-5");
  });

  it("padding を渡すと既定の p-5 は付かない", () => {
    // className に p-4 を書いても効かない。このプロジェクトは clsx だけで
    // tailwind-merge を使っておらず、clsx は衝突するクラスを畳まないため、
    // class 属性に p-4 と p-5 が並び、生成CSSの順序（p-4 -> p-5）で p-5 が勝つ。
    // 実際 app/plans/[planId]/page.tsx など3箇所が p-4 のつもりで p-5 で描かれていた。
    const { container } = render(<Card padding="p-4">本文</Card>);
    const classes = (container.querySelector("section") as HTMLElement).className.split(" ");

    expect(classes).toContain("p-4");
    expect(classes).not.toContain("p-5");
  });

  it("padding と className は併用できる（className 側は余白以外に使う）", () => {
    const { container } = render(
      <Card padding="p-3 sm:p-5" className="scroll-mt-24">
        本文
      </Card>
    );
    const classes = (container.querySelector("section") as HTMLElement).className.split(" ");

    expect(classes).toContain("p-3");
    expect(classes).toContain("sm:p-5");
    expect(classes).toContain("scroll-mt-24");
    expect(classes).not.toContain("p-5");
  });
});
