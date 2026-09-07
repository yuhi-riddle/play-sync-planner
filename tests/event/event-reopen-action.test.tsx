import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventReopenAction } from "@/components/event/event-reopen-action";

describe("EventReopenAction", () => {
  it("「完了を取り消す」ボタンを出し、押すと action を submit する", () => {
    const action = vi.fn();
    render(<EventReopenAction action={action} />);
    expect(screen.getByRole("button", { name: "完了を取り消す" })).toBeInTheDocument();
    expect(screen.getByText(/自動で完了になりました/)).toBeInTheDocument();
  });
});
