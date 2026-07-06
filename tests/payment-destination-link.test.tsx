import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaymentDestinationLink } from "@/components/payment-destination-link";

describe("PaymentDestinationLink", () => {
  it("renders an external payment link when a URL is provided", () => {
    render(
      <PaymentDestinationLink
        href="https://example.com/pay"
        label="PayPayで支払う"
        detail="外部決済ページを開いて支払えます"
      />
    );

    const link = screen.getByRole("link", { name: "PayPayで支払う" });
    expect(link).toHaveAttribute("href", "https://example.com/pay");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(link).toHaveClass("w-full");
    expect(link).toHaveClass("sm:w-auto");
    expect(screen.getByText("外部決済ページを開いて支払えます")).toBeInTheDocument();
  });

  it("shows the detail without a link when a URL is not provided", () => {
    render(<PaymentDestinationLink href={null} label="支払い先を開く" detail="支払い方法を確認してください" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("支払い方法を確認してください")).toBeInTheDocument();
  });
});
