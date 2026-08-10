
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

describe("legal pages", () => {
  it("shows the expected terms sections and a login return link", async () => {
    render(await TermsPage({ searchParams: Promise.resolve({ from: "login", next: "/events/event-1" }) }));

    expect(screen.getByRole("heading", { name: "3. 利用者の責任" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログインへ戻る" })).toHaveAttribute("href", "/login?next=%2Fevents%2Fevent-1");
  });

  it("explains shared-link visibility and the retention period", async () => {
    render(await PrivacyPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "4. 共有範囲" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7. 保存期間" })).toBeInTheDocument();
    // 共有リンクはトークンを知っているだけでは開けない。本文もそう読める形になっている。
    expect(screen.getByText(/リンクを知っているだけでは開けません/)).toBeInTheDocument();
  });

  it("退会の方法と、退会しても残る記録を説明する", async () => {
    render(await PrivacyPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "8. 退会と削除" })).toBeInTheDocument();
    expect(screen.getByText(/設定画面から退会/)).toBeInTheDocument();
    expect(screen.getByText(/イベントと清算の記録は残ります/)).toBeInTheDocument();
  });
});
