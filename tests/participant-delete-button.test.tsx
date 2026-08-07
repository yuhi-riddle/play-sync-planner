import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ParticipantDeleteButton } from "@/components/participant-delete-button";
import type { ActionState } from "@/lib/domain/action-state";

const trashLabel = "たろうを参加者から削除";
const confirmText = "たろうさんを参加者から外しますか？";

function renderButton(result: ActionState = { status: "success", message: "外しました。" }) {
  const action = vi.fn(async () => result);
  render(<ParticipantDeleteButton action={action} displayName="たろう" />);
  return action;
}

describe("ParticipantDeleteButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("最初はゴミ箱ボタンだけを出す", () => {
    renderButton();

    expect(screen.getByRole("button", { name: trashLabel })).toBeInTheDocument();
    expect(screen.queryByText(confirmText)).not.toBeInTheDocument();
  });

  it("ゴミ箱を押しただけでは削除しない", () => {
    const action = renderButton();

    fireEvent.click(screen.getByRole("button", { name: trashLabel }));

    // 参加者の回答は削除連鎖で一緒に消える。誤タップで消えては困る
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(confirmText)).toBeInTheDocument();
    expect(screen.getByText("この人の回答も一緒に消えます。元に戻せません。")).toBeInTheDocument();
  });

  it("ブラウザ標準の confirm は使わない", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    renderButton();
    fireEvent.click(screen.getByRole("button", { name: trashLabel }));

    expect(confirmSpy).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  it("確認を出したら「外す」ボタンにフォーカスを移す", () => {
    renderButton();

    fireEvent.click(screen.getByRole("button", { name: trashLabel }));

    // ゴミ箱ボタンと入れ替わるので、移さないとフォーカスが body に落ちる
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "外す" }));
  });

  it("「やめる」でゴミ箱ボタンに戻る", () => {
    const action = renderButton();

    fireEvent.click(screen.getByRole("button", { name: trashLabel }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: trashLabel })).toBeInTheDocument();
    expect(screen.queryByText(confirmText)).not.toBeInTheDocument();
  });

  it("「外す」で削除する", async () => {
    const action = renderButton();

    fireEvent.click(screen.getByRole("button", { name: trashLabel }));
    fireEvent.click(screen.getByRole("button", { name: "外す" }));

    await waitFor(() => {
      expect(action).toHaveBeenCalledTimes(1);
    });
  });

  it("断られたら理由を出して、確認パネルは畳む", async () => {
    const refusal = "たろうさんが立て替えた記録があります（「レンタカー」）。";
    renderButton({ status: "error", message: refusal });

    fireEvent.click(screen.getByRole("button", { name: trashLabel }));
    fireEvent.click(screen.getByRole("button", { name: "外す" }));

    // 「外しますか？」と断り文が同時に出ると読めない
    expect(await screen.findByRole("alert")).toHaveTextContent(refusal);
    expect(screen.queryByText(confirmText)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: trashLabel })).toBeInTheDocument();
  });
});
