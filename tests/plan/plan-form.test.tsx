import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlanForm } from "@/components/plan/plan-form";

function chooseOption(label: string, optionName: string) {
  fireEvent.click(screen.getByLabelText(label));
  fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: optionName }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PlanForm", () => {
  it("adds a candidate datetime and reaches the review step with a deadline", async () => {
    const props = { action: vi.fn(), submitLabel: "この内容で日程調整を始める", participantCount: 3 };
    render(<PlanForm {...props} />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    await waitFor(() => expect(screen.getByRole("button", { name: /^開始 /  })).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

    expect(screen.getByText("候補 1")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    expect(screen.getByRole("heading", { name: "回答期限を選ぶ" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/7月14日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByRole("heading", { name: "リマインドを決める" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
    expect(screen.getByText("参加者 3人")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "候補 1 を削除" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "この内容で日程調整を始める" })).toBeEnabled();
    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T19:00");
    expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-15T21:00");
    expect(document.querySelector('input[name="answer_deadline_at"]')).toHaveAttribute("value", "2026-07-14T23:45");
  });

  it("サーバーからのエラーを表示し、入力し直した候補日時を消さない", async () => {
    const action = vi.fn().mockResolvedValue({ status: "error", message: "回答期限は最初の候補日時より前にしてください。" });
    render(<PlanForm action={action} submitLabel="この内容で日程調整を始める" participantCount={3} />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    fireEvent.click(screen.getByLabelText(/7月14日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    fireEvent.click(screen.getByRole("button", { name: "この内容で日程調整を始める" }));

    expect(await screen.findByText("回答期限は最初の候補日時より前にしてください。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T19:00");
  });

  it("blocks review when the answer deadline is after the first candidate", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    // 候補日と同じ7月15日を回答期限に選ぶと、既定の回答期限時刻(23:45)は
    // 候補日時の終了(21:00)より後になるため、常にエラーになる
    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByText("回答期限は最初の候補日時より前にしてください。")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "内容を確認する" })).not.toBeInTheDocument();
  });

  it("shows nazotoki template times", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventCategory="nazotoki" />);

    fireEvent.click(screen.getByRole("button", { name: "13:00〜" }));

    expect(screen.getByRole("button", { name: "開始 13:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "終了 15:00" })).toBeInTheDocument();
  });

  it("adds a multi-day candidate by dragging across dates", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.pointerDown(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.pointerEnter(screen.getByLabelText(/7月16日.*を選択/));
    fireEvent.pointerUp(screen.getByLabelText(/7月16日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));

    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T19:00");
    expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-16T21:00");
  });

  it("adds an all-day candidate with an all-day hidden flag", () => {
    render(<PlanForm action={vi.fn()} submitLabel="蜈ｱ譛峨Μ繝ｳ繧ｯ繧剃ｽ懈・" />);

    const julyDateButton = screen
      .getAllByRole("button")
      .find((button) => button.getAttribute("aria-label")?.includes("7月15日")) as HTMLElement;

    fireEvent.click(julyDateButton);
    fireEvent.click(screen.getByRole("checkbox", { name: "終日" }));
    const addButton = screen.getAllByRole("button").find((button) => button.textContent?.includes("候補")) as HTMLElement;
    fireEvent.click(addButton);

    expect(document.querySelector('input[name="candidateDates"]')).toHaveAttribute("value", "2026-07-15T00:00");
    expect(document.querySelector('input[name="candidateEndDates"]')).toHaveAttribute("value", "2026-07-16T00:00");
    expect(document.querySelector('input[name="candidateAllDays"]')).toHaveAttribute("value", "true");
  });

  it("stores a custom reminder offset", () => {
    render(<PlanForm action={vi.fn()} submitLabel="蜈ｱ譛峨Μ繝ｳ繧ｯ繧剃ｽ懈・" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    const reminderInput = document.querySelector('input[name="reminder_offset_minutes"]');
    expect(reminderInput).toHaveValue("1440");
    expect(document.querySelectorAll('input[name="reminder_offsets_minutes"]')).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("回答期限の1日前 数値"), { target: { value: "6" } });
    chooseOption("回答期限の6日前 単位", "時間前");

    expect(reminderInput).toHaveValue("360");
  });

  it("stores multiple reminder offsets", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    fireEvent.click(screen.getByRole("button", { name: "リマインドを追加" }));
    fireEvent.change(screen.getByLabelText("回答期限の1時間前 数値"), { target: { value: "3" } });

    const reminderInputs = Array.from(document.querySelectorAll('input[name="reminder_offsets_minutes"]')).map((input) =>
      input.getAttribute("value")
    );
    expect(reminderInputs).toEqual(["1440", "180"]);
    expect(document.querySelector('input[name="reminder_offset_minutes"]')).toHaveAttribute("value", "1440");
  });

  it("scrolls to the top of the next step", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it("shows a settings link when Google Calendar is not connected", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" calendarAvailability={{ enabled: false }} />);

    expect(screen.getByRole("link", { name: "設定で連携する" })).toHaveAttribute("href", "/settings");
  });

  it("STEP3の「次へ」ボタンとSTEP4の送信ボタンはDOMノードとして別物であること", () => {
    // key無しの三項演算子だと、Reactは同じ<button>DOMノードを使い回して type 属性だけ
    // "button" → "submit" に書き換える。クリックは同期的にDOMへ反映されるため、
    // ブラウザがクリックのデフォルトアクション（フォーム送信）を評価する時点で
    // 既に type="submit" になっており、STEP3の「次へ」でフォームが送信されてしまう。
    // ノードが使い回されず作り直されていれば、この事故は起きない。
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByLabelText(/7月15日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: "候補に追加" }));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    fireEvent.click(screen.getByLabelText(/7月14日.*を選択/));
    fireEvent.click(screen.getByRole("button", { name: /次へ/ }));

    expect(screen.getByRole("heading", { name: "リマインドを決める" })).toBeInTheDocument();

    const nextButtonNode = screen.getByRole("button", { name: /次へ/ });
    // STEP3表示時点で送信ボタン(type="submit")が存在しないことも確認する
    expect(document.querySelector('form button[type="submit"]')).not.toBeInTheDocument();

    fireEvent.click(nextButtonNode);

    expect(screen.getByRole("heading", { name: "内容を確認する" })).toBeInTheDocument();
    const submitButtonNode = screen.getByRole("button", { name: "共有リンクを作成" });

    expect(nextButtonNode).not.toBe(submitButtonNode);
  });

  it("月選択パネルは、月を選ぶと自動で閉じる", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByRole("button", { name: /2026年7月/ }));
    expect(screen.getByLabelText("月を選択")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("月を選択"));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "8月" }));

    expect(screen.queryByLabelText("月を選択")).not.toBeInTheDocument();
  });

  it("月選択パネルは、外側をクリックすると閉じる", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" />);

    fireEvent.click(screen.getByRole("button", { name: /2026年7月/ }));
    expect(screen.getByLabelText("月を選択")).toBeInTheDocument();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByLabelText("月を選択")).not.toBeInTheDocument();
  });

  it("謎解きテンプレートは時刻チップの直上に表示される", () => {
    render(<PlanForm action={vi.fn()} submitLabel="共有リンクを作成" eventCategory="nazotoki" />);

    const template = screen.getByText("謎解きテンプレート");
    const startChip = screen.getByRole("button", { name: /^開始 / });
    // DOM順で謎解きテンプレートが開始チップより前にあることを確認する
    expect(template.compareDocumentPosition(startChip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
