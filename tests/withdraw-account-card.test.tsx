import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WithdrawAccountCard } from "@/components/withdraw-account-card";
import { ACCOUNT_ACTION_INITIAL_STATE, type AccountActionState } from "@/lib/domain/account";

const noopAction = async (): Promise<AccountActionState> => ACCOUNT_ACTION_INITIAL_STATE;

describe("WithdrawAccountCard", () => {
  beforeEach(() => {
    vi.stubGlobal("React", React);
  });

  it("表示名の入力を必須にして、取り消せないことを伝える", () => {
    render(<WithdrawAccountCard nickname="あかり" unpaidSettlementCount={0} action={noopAction} />);

    const confirmation = screen.getByLabelText(/表示名/);
    expect(confirmation).toBeRequired();
    expect(screen.getByText(/取り消せません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退会する" })).toBeInTheDocument();
  });

  it("残る記録と消えるデータの両方を明示する", () => {
    render(<WithdrawAccountCard nickname="あかり" unpaidSettlementCount={0} action={noopAction} />);

    expect(screen.getByText(/イベントと清算の記録は残ります/)).toBeInTheDocument();
    expect(screen.getByText(/つながり/)).toBeInTheDocument();
  });

  it("未完了の清算があるときは件数つきで警告する", () => {
    render(<WithdrawAccountCard nickname="あかり" unpaidSettlementCount={2} action={noopAction} />);

    expect(screen.getByText(/未完了の清算が2件あります/)).toBeInTheDocument();
  });

  it("未完了の清算が無いときは警告を出さない", () => {
    render(<WithdrawAccountCard nickname="あかり" unpaidSettlementCount={0} action={noopAction} />);

    expect(screen.queryByText(/未完了の清算が/)).not.toBeInTheDocument();
  });
});
