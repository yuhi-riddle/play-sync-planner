import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import GlobalError from "@/app/global-error";

vi.stubGlobal("React", React);

describe("GlobalError", () => {
  // ルートレイアウトごと置き換わる画面なので、ヘッダーもフッターも出ない。
  // ここにも入口を置かないと、エラーが続くあいだログインも規約も辿れなくなる。
  it("keeps a way home, to log in, and to the legal documents", () => {
    const markup = renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={() => {}} />);

    for (const href of ["/", "/login", "/terms", "/privacy"]) {
      expect(markup).toContain(`href="${href}"`);
    }
    expect(markup).toContain("もう一度試す");
  });
});
