import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ExpenseForm } from "@/components/expense-form";

const participants = [
  { id: "p1", displayName: "ゆき" },
  { id: "p2", displayName: "はると" },
  { id: "p3", displayName: "みお" }
];

function renderForm(initialValues?: React.ComponentProps<typeof ExpenseForm>["initialValues"]) {
  return render(<ExpenseForm participants={participants} action={vi.fn()} initialValues={initialValues} />);
}

function splitFields(container: HTMLElement) {
  return container.querySelector('[data-testid="expense-split-fields"]') as HTMLFieldSetElement;
}

/**
 * 割り方ブロックが畳まれているか。
 *
 * hidden 属性（IDLプロパティ）だけを見ても実際に消えたことにはならない。
 * [hidden] { display: none } は UAスタイルシートの規則で、クラスセレクタの
 * .grid { display: grid } に負ける。実際それで見えたままになっていた。
 * jsdom は Tailwind を読まないので computed style では確かめられず、
 * class から display を決めるクラスを直接見る。
 */
function splitCollapsed(container: HTMLElement) {
  const fieldset = splitFields(container);
  const classes = fieldset.className.split(" ");

  return {
    hiddenAttr: fieldset.hidden,
    display: classes.includes("hidden") ? "none" : classes.includes("grid") ? "grid" : "unknown"
  };
}

const collapsed = { hiddenAttr: true, display: "none" };
const expanded = { hiddenAttr: false, display: "grid" };

describe("ExpenseForm", () => {
  it("支払い方法の欄は出さない", () => {
    renderForm();

    expect(screen.queryByText("支払い方法")).not.toBeInTheDocument();
  });

  describe("割り方の畳み込み", () => {
    it("既定は均等割りで、割り方の詳細は畳まれている", () => {
      const { container } = renderForm({ amount: 3600 });

      expect(splitCollapsed(container)).toEqual(collapsed);
      expect(screen.getByRole("button", { name: "割り方を変える" })).toBeInTheDocument();
    });

    it("畳まれていても要約に「全員で均等割り」と1人あたりの金額が出る", () => {
      renderForm({ amount: 3600 });

      expect(screen.getByText("全員で均等割り · 1人あたり 1,200円")).toBeInTheDocument();
    });

    it("端数が出る金額では1人あたりを幅で示す", () => {
      renderForm({ amount: 3601 });

      expect(screen.getByText("全員で均等割り · 1人あたり 1,200円〜1,201円")).toBeInTheDocument();
    });

    it("金額を打ち替えると1人あたりが追随する", () => {
      const { container } = renderForm({ amount: 3600 });

      fireEvent.input(container.querySelector('input[name="amount"]') as HTMLInputElement, {
        target: { value: "3000" }
      });

      expect(screen.getByText("全員で均等割り · 1人あたり 1,000円")).toBeInTheDocument();
    });

    it("金額が未入力なら1人あたりは出さない", () => {
      renderForm();

      expect(screen.getByText("全員で均等割り")).toBeInTheDocument();
    });

    it("畳まれていても負担者は全員ぶん送信される", () => {
      // 畳んだせいで split_participant_ids が空になると、サーバーが
      // 「負担者を1人以上選択してください」で弾いてしまう。
      // DOM にあるかではなく実際に送信されるかを見る。hidden なら送信されるが、
      // fieldset を disabled にしたり畳んだ側を unmount すると送信されなくなる。
      const { container } = renderForm({ amount: 3600 });
      const form = container.querySelector("form") as HTMLFormElement;

      expect(new FormData(form).getAll("split_participant_ids")).toEqual(["p1", "p2", "p3"]);
    });

    it("畳まれていても割り方そのもの（均等割り）は送信される", () => {
      const { container } = renderForm({ amount: 3600 });
      const form = container.querySelector("form") as HTMLFormElement;

      expect(new FormData(form).get("split_mode")).toBe("equal");
    });

    it("「割り方を変える」で開き、「割り方を閉じる」で畳み直せる", () => {
      const { container } = renderForm({ amount: 3600 });

      fireEvent.click(screen.getByRole("button", { name: "割り方を変える" }));
      expect(splitCollapsed(container)).toEqual(expanded);

      fireEvent.click(screen.getByRole("button", { name: "割り方を閉じる" }));
      expect(splitCollapsed(container)).toEqual(collapsed);
    });

    it("一部だけ選ぶと要約の人数が変わる", () => {
      const { container } = renderForm({ amount: 3600 });

      fireEvent.click(screen.getByRole("button", { name: "割り方を変える" }));
      fireEvent.click(within(splitFields(container)).getByLabelText("みお"));
      fireEvent.click(screen.getByRole("button", { name: "割り方を閉じる" }));

      expect(screen.getByText("2人で均等割り · 1人あたり 1,800円")).toBeInTheDocument();
    });
  });

  describe("個別金額", () => {
    it("個別金額モードでは畳めない（要約が実際の割り方と食い違わないように）", () => {
      const { container } = renderForm({ amount: 3600 });

      fireEvent.click(screen.getByRole("button", { name: "割り方を変える" }));
      fireEvent.click(screen.getByLabelText("個別金額"));

      expect(splitCollapsed(container)).toEqual(expanded);
      expect(screen.queryByRole("button", { name: "割り方を閉じる" })).not.toBeInTheDocument();
    });

    it("合計が足りないと、送信する前に不足額が出る", () => {
      renderForm({
        amount: 3600,
        splitMode: "individual",
        splitParticipantIds: ["p1", "p2", "p3"],
        individualAmounts: { p1: 1200, p2: 1200, p3: 1100 }
      });

      expect(screen.getByText(/入力の合計 3,500円 \/ 3,600円（あと 100円 足りません）/)).toBeInTheDocument();
    });

    it("合計が多すぎるときも超過額が出る", () => {
      renderForm({
        amount: 3600,
        splitMode: "individual",
        splitParticipantIds: ["p1", "p2", "p3"],
        individualAmounts: { p1: 1300, p2: 1200, p3: 1200 }
      });

      expect(screen.getByText(/入力の合計 3,700円 \/ 3,600円（100円 多いです）/)).toBeInTheDocument();
    });

    it("合計が一致すると一致していることが分かる", () => {
      renderForm({
        amount: 3600,
        splitMode: "individual",
        splitParticipantIds: ["p1", "p2", "p3"],
        individualAmounts: { p1: 1200, p2: 1200, p3: 1200 }
      });

      expect(screen.getByText(/入力の合計 3,600円 \/ 3,600円（一致しています）/)).toBeInTheDocument();
    });

    it("負担額を打ち直すと不足額が追随する", () => {
      renderForm({
        amount: 3600,
        splitMode: "individual",
        splitParticipantIds: ["p1", "p2", "p3"],
        individualAmounts: { p1: 1200, p2: 1200, p3: 1100 }
      });

      fireEvent.change(screen.getByLabelText("みお の負担額"), { target: { value: "1200" } });

      expect(screen.getByText(/（一致しています）/)).toBeInTheDocument();
    });

    it("初期値が個別金額なら最初から開いている", () => {
      const { container } = renderForm({
        amount: 3600,
        splitMode: "individual",
        splitParticipantIds: ["p1"],
        individualAmounts: { p1: 3600 }
      });

      expect(splitCollapsed(container)).toEqual(expanded);
      expect(screen.queryByRole("button", { name: "割り方を変える" })).not.toBeInTheDocument();
    });
  });

  describe("詳細の畳み込み", () => {
    it("URL・重要メモ・メモは既定で畳まれている", () => {
      const { container } = renderForm({ amount: 3600 });

      expect(container.querySelector("details")?.open).toBe(false);
    });

    it("畳まれていても3つの欄は送信対象として残っている", () => {
      const { container } = renderForm({ amount: 3600 });

      expect(container.querySelector('input[name="payment_url"]')).toBeInTheDocument();
      expect(container.querySelector('input[name="is_important"]')).toBeInTheDocument();
      expect(container.querySelector('textarea[name="memo"]')).toBeInTheDocument();
    });

    it("既にメモが入っている経費は開いた状態で出す", () => {
      const { container } = renderForm({ amount: 3600, memo: "予約番号 A-123" });

      expect(container.querySelector("details")?.open).toBe(true);
    });

    it("既にURLが入っている経費も開いた状態で出す", () => {
      const { container } = renderForm({ amount: 3600, paymentUrl: "https://example.com" });

      expect(container.querySelector("details")?.open).toBe(true);
    });

    it("重要メモが付いている経費も開いた状態で出す", () => {
      const { container } = renderForm({ amount: 3600, isImportant: true });

      expect(container.querySelector("details")?.open).toBe(true);
    });
  });
});
