import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AccountEmailCard } from "@/components/account/account-email-card";

describe("AccountEmailCard", () => {
  it("explains how to use a different login email", () => {
    render(<AccountEmailCard email="me@example.com" />);

    expect(screen.getByText("Googleログインのメールアドレス")).toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByText("別のメールアドレスを使う場合は、一度ログアウトして別のGoogleアカウントでログインしてください。")).toBeInTheDocument();
  });
});
