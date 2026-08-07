import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaymentRecordedNotice } from "@/components/settlement/payment-recorded-notice";

describe("PaymentRecordedNotice", () => {
  it("announces that a payment was recorded and what happens next", () => {
    render(<PaymentRecordedNotice />);

    const notice = screen.getByRole("status");
    expect(notice).toHaveAttribute("aria-live", "polite");
    expect(screen.getByText("支払い記録を受け付けました")).toBeInTheDocument();
    expect(screen.getByText("主催者が受け取り確認をすると、清算済みに変わります。")).toBeInTheDocument();
    expect(screen.getByText("必要なら、このページをあとで開き直して確認できます。")).toBeInTheDocument();
  });
});
