import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettlementCompletionNotice } from "@/components/settlement/settlement-completion-notice";

describe("SettlementCompletionNotice", () => {
  it("shows a completion notice when every settlement has been confirmed", () => {
    render(<SettlementCompletionNotice isComplete settlementCount={2} />);

    expect(screen.getByRole("status")).toHaveTextContent("清算完了");
    expect(screen.getByText("支払いと受け取り確認がすべて完了しています。")).toBeInTheDocument();
  });

  it("stays hidden while settlement work remains", () => {
    const { container } = render(<SettlementCompletionNotice isComplete={false} settlementCount={2} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when there are no settlements yet", () => {
    const { container } = render(<SettlementCompletionNotice isComplete settlementCount={0} />);

    expect(container).toBeEmptyDOMElement();
  });
});
