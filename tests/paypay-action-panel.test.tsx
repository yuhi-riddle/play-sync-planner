import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PayPayActionPanel } from "@/components/paypay-action-panel";

describe("PayPayActionPanel", () => {
  it("shows a note that the PayPay app only opens on smartphones", () => {
    render(<PayPayActionPanel amount={2600} />);

    expect(screen.getByRole("button", { name: "PayPayを開く" })).toBeInTheDocument();
    expect(screen.getByText("スマホのPayPayアプリがある場合に開きます。")).toBeInTheDocument();
  });
});
