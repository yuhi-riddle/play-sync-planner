import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MadoiForm, TextField } from "@/components/ui";

describe("MadoiForm", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("shows an in-app validation message instead of relying on the browser tooltip", () => {
    const action = vi.fn();

    render(
      <MadoiForm action={action} className="grid gap-4">
        <TextField label="予定名" name="title" required requiredMessage="予定名を入力してください" />
        <button type="submit">保存</button>
      </MadoiForm>
    );

    fireEvent.submit(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("alert")).toHaveTextContent("入力を確認してください。");
    expect(screen.getByText("予定名を入力してください")).toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });
});
