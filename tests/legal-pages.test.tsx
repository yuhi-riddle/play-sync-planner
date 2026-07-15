
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

describe("legal pages", () => {
  it("shows the expected terms sections and a login return link", async () => {
    render(await TermsPage({ searchParams: Promise.resolve({ from: "login" }) }));

    expect(screen.getByRole("heading", { name: "3. 利用者の責任" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ログインへ戻る" })).toHaveAttribute("href", "/login");
  });

  it("explains shared-link visibility and the retention period", async () => {
    render(await PrivacyPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: "4. 共有範囲" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "7. 保存期間" })).toBeInTheDocument();
    expect(screen.getByText(/日程回答用の共有リンク/)).toBeInTheDocument();
  });
});
