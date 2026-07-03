import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MadoiForm, MadoiSelect, TextField } from "@/components/ui";

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

  it("stores the selected custom option in a form field", () => {
    render(
      <MadoiForm action={vi.fn()} className="grid gap-4">
        <MadoiSelect
          name="category"
          fieldLabel="カテゴリ"
          defaultValue=""
          required
          requiredMessage="カテゴリを選択してください"
          options={[
            { value: "", label: "選択してください", disabled: true },
            { value: "meal", label: "食事" },
            { value: "travel", label: "旅行" }
          ]}
        />
      </MadoiForm>
    );

    fireEvent.click(screen.getByRole("button", { name: "カテゴリ" }));
    fireEvent.click(screen.getByRole("option", { name: "旅行" }));

    expect(document.querySelector('input[name="category"]')).toHaveValue("travel");
  });
});
