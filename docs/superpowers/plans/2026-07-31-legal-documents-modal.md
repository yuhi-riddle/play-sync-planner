# 規約・プライバシーポリシーのモーダル表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ログイン画面の同意欄から利用規約・プライバシーポリシーを、別ページへ遷移せずモーダルで読めるようにする。

**Architecture:** 本文を `lib/legal-documents.ts` に切り出し、`components/legal-document-body.tsx` がページとモーダルの両方に同じ本文を描く。モーダルはクライアントコンポーネントで、Escape・フォーカス管理を持つ。ページ (`/terms` `/privacy`) は残す。

**Tech Stack:** Next.js 15 (App Router), React 19, Vitest + React Testing Library (jsdom), Tailwind CSS

## Global Constraints

- 設計の正は `docs/superpowers/specs/2026-07-31-legal-documents-modal-design.md`
- テストは `tests/` 直下にのみ置く（コロケーション不可）
- UI プリミティブは `components/ui.tsx` から import する（`ui-server.tsx` / `ui-client.tsx` を直接 import しない）
- `.tsx` では `import React from "react";` を明示する（既存 50 コンポーネント中 43 がこの形）
- jsdom では computed style が取れないため、見た目の検証はクラス名の存在で行う
- 規約・プライバシーポリシーの**本文は一字一句変えない**。移動のみ
- 設定ファイル・DBスキーマは変更しない
- 依頼と無関係なリファクタリング・整形をしない
- 各タスクの最後にコミットする。push はしない

---

### Task 1: 本文を共有モジュールへ切り出す

表示は一切変えない。`/terms` `/privacy` の見た目が変わらないまま、本文の置き場所だけを移す。

**Files:**
- Create: `lib/legal-documents.ts`
- Create: `components/legal-document-body.tsx`
- Modify: `app/terms/page.tsx`、`app/privacy/page.tsx`
- Test: `tests/legal-documents.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type LegalSection = { title: string; body: string }`
  - `LEGAL_EFFECTIVE_DATE: string`（値は `"2026年7月10日"`）
  - `TERMS_SECTIONS: LegalSection[]`（8項目）
  - `PRIVACY_SECTIONS: LegalSection[]`（9項目）
  - `LegalDocumentBody({ sections, headingLevel }: { sections: LegalSection[]; headingLevel?: "h2" | "h3" })`

- [ ] **Step 1: Write the failing test**

`tests/legal-documents.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { LEGAL_EFFECTIVE_DATE, PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal-documents";

describe("法的文書の本文", () => {
  it("利用規約は8項目ある", () => {
    expect(TERMS_SECTIONS).toHaveLength(8);
  });

  it("プライバシーポリシーは9項目ある", () => {
    expect(PRIVACY_SECTIONS).toHaveLength(9);
  });

  it("節はすべて表題と本文を持つ", () => {
    for (const section of [...TERMS_SECTIONS, ...PRIVACY_SECTIONS]) {
      expect(section.title).toBeTruthy();
      expect(section.body).toBeTruthy();
    }
  });

  it("施行日を持つ", () => {
    expect(LEGAL_EFFECTIVE_DATE).toBe("2026年7月10日");
  });

  // 移設で本文が失われていないことの見張り。表題は既存テストが参照しているものと同じ。
  it("移設しても主要な節が残っている", () => {
    expect(TERMS_SECTIONS.map((section) => section.title)).toContain("3. 利用者の責任");
    expect(PRIVACY_SECTIONS.map((section) => section.title)).toContain("4. 共有範囲");
    expect(PRIVACY_SECTIONS.map((section) => section.title)).toContain("8. 退会と削除");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/legal-documents.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/legal-documents"`

- [ ] **Step 3: Write minimal implementation**

`lib/legal-documents.ts` を作る。

```ts
export type LegalSection = {
  title: string;
  body: string;
};

export const LEGAL_EFFECTIVE_DATE = "2026年7月10日";

export const TERMS_SECTIONS: LegalSection[] = [
  // app/terms/page.tsx の sections をそのまま移す（8項目・本文は一字一句変えない）
];

export const PRIVACY_SECTIONS: LegalSection[] = [
  // app/privacy/page.tsx の sections をそのまま移す（9項目・本文は一字一句変えない）
];
```

上のコメントは「既存ファイルから配列の中身をそのまま移せ」という指示である。**コメントのまま残さず、必ず現在の `app/terms/page.tsx:5-38` と `app/privacy/page.tsx:5-42` の配列を移植すること。**

`components/legal-document-body.tsx` を作る。

```tsx
import React from "react";

import type { LegalSection } from "@/lib/legal-documents";

export function LegalDocumentBody({
  sections,
  headingLevel = "h2"
}: {
  sections: LegalSection[];
  headingLevel?: "h2" | "h3";
}) {
  const Heading = headingLevel;

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.title}>
          <Heading className="text-lg font-bold text-ink">{section.title}</Heading>
          <p className="mt-2 text-sm leading-7 text-muted">{section.body}</p>
        </section>
      ))}
    </div>
  );
}
```

`app/terms/page.tsx` から `sections` の定義を削除し、共有モジュールと共有コンポーネントを使う形にする。`Card` の中は次のようになる。

```tsx
      <Card>
        <p className="text-sm leading-7 text-muted">施行日: {LEGAL_EFFECTIVE_DATE}</p>
        <div className="mt-6">
          <LegalDocumentBody sections={TERMS_SECTIONS} />
        </div>
      </Card>
```

`app/privacy/page.tsx` も同様に `PRIVACY_SECTIONS` を使う形にする。`PageHeader` の `title` / `description` / `action` と `eyebrow` は現状のまま変えないこと。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-documents.test.ts tests/legal-pages.test.tsx`
Expected: PASS。既存の `legal-pages.test.tsx`（3件）が**変更なしで通り続ける**ことが、表示が変わっていない証拠になる。

Run: `npm test`、`npx tsc --noEmit`、`npm run lint`
Expected: すべて成功

- [ ] **Step 5: Commit**

```bash
git add lib/legal-documents.ts components/legal-document-body.tsx app/terms/page.tsx app/privacy/page.tsx tests/legal-documents.test.ts
git commit -m "refactor: extract legal document bodies into a shared module"
```

---

### Task 2: モーダルコンポーネント

**Files:**
- Create: `components/legal-modal.tsx`
- Test: `tests/legal-modal.test.tsx`

**Interfaces:**
- Consumes: `LegalSection`、`LegalDocumentBody`（Task 1）
- Produces: `LegalModal({ title, sections, pageHref, onClose }: { title: string; sections: LegalSection[]; pageHref: string; onClose: () => void })`

- [ ] **Step 1: Write the failing test**

`tests/legal-modal.test.tsx`:

```tsx
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LegalModal } from "@/components/legal-modal";

const sections = [
  { title: "1. 適用", body: "この利用規約は、Madoi を利用するすべての方に適用されます。" },
  { title: "2. アカウント", body: "Madoi の利用には Google アカウントでのログインが必要です。" }
];

function renderModal(onClose = vi.fn()) {
  render(<LegalModal title="利用規約" sections={sections} pageHref="/terms" onClose={onClose} />);
  return onClose;
}

describe("LegalModal", () => {
  it("表題と本文を出す", () => {
    renderModal();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "利用規約" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. 適用" })).toBeInTheDocument();
  });

  it("支援技術に表題を伝える", () => {
    renderModal();
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveAttribute("aria-modal", "true");
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy as string)?.textContent).toBe("利用規約");
  });

  it("開いた直後は閉じるボタンにフォーカスが当たる", () => {
    renderModal();

    expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
  });

  it("Escapeで閉じる", () => {
    const onClose = renderModal();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("閉じるボタンで閉じる", () => {
    const onClose = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // モーダルにするとリンクの中央クリック・右クリックで別タブに開く道が失われるため、
  // ページへの導線を内側に残す。
  it("ページで開く導線を持つ", () => {
    renderModal();

    expect(screen.getByRole("link", { name: "ページで開く" })).toHaveAttribute("href", "/terms");
  });

  it("本文が長いときに内側でスクロールできる", () => {
    const { container } = render(
      <LegalModal title="利用規約" sections={sections} pageHref="/terms" onClose={vi.fn()} />
    );

    expect(container.querySelector(".overflow-y-auto")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/legal-modal.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/legal-modal"`

- [ ] **Step 3: Write minimal implementation**

`components/legal-modal.tsx`:

```tsx
"use client";

import Link from "next/link";
import React, { useEffect, useId, useRef } from "react";

import { LegalDocumentBody } from "@/components/legal-document-body";
import { LEGAL_EFFECTIVE_DATE, type LegalSection } from "@/lib/legal-documents";

export function LegalModal({
  title,
  sections,
  pageHref,
  onClose
}: {
  title: string;
  sections: LegalSection[];
  pageHref: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // 背景へ抜けないように、モーダル内の操作できる要素の間だけを行き来させる。
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button");
      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/42 px-4 py-8 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-control border border-line bg-cream p-5 shadow-soft"
      >
        <div>
          <h2 id={titleId} className="text-xl font-bold text-ink">
            {title}
          </h2>
          <p className="mt-1 text-sm leading-7 text-muted">施行日: {LEGAL_EFFECTIVE_DATE}</p>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          <LegalDocumentBody sections={sections} headingLevel="h3" />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <Link
            href={pageHref}
            className="inline-flex min-h-11 items-center font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            ページで開く
          </Link>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
          >
            閉じる
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/legal-modal.test.tsx`
Expected: PASS（7 tests）

Run: `npm test`、`npx tsc --noEmit`、`npm run lint`
Expected: すべて成功

- [ ] **Step 5: Commit**

```bash
git add components/legal-modal.tsx tests/legal-modal.test.tsx
git commit -m "feat: add the legal document modal"
```

---

### Task 3: 同意欄をモーダルに切り替える

**Files:**
- Modify: `components/login-consent-form.tsx`
- Modify: `tests/login-consent-form.test.tsx`

**Interfaces:**
- Consumes: `LegalModal`（Task 2）、`TERMS_SECTIONS` / `PRIVACY_SECTIONS`（Task 1）
- Produces: なし

#### 既存テストの扱い（重要）

`tests/login-consent-form.test.tsx` の7件のうち4件は、**画面遷移を前提にしているため成立しなくなる**。仕様変更に伴う正当な更新なので、次のとおり扱うこと。テストを消して通すこととは違う。迷ったら止めて報告すること。

| 既存テスト | 扱い |
|---|---|
| 書面を開くまでチェックできない | **残す**。リンクではなくボタンを押す形に書き換える |
| 書面リンクの次に大きな同意操作へ進める | **残す**。ボタンを押す形に書き換える |
| 両方を開いて同意するまでログインできない | **残す**。ボタンを押す形に書き換える |
| 中央クリックで書面を開いた場合もチェックできる | **削除**。ボタンには中央クリックで別タブという概念がない。代替はモーダル内の「ページで開く」リンク（Task 2 で検証済み） |
| 右クリックから書面を開く場合も同意欄を操作できる | **削除**。同上 |
| 規約は同じタブで開き、戻る導線で同意画面を再開できる | **削除**。`href` の検証はモーダルには当てはまらない |
| 規約ページから戻っても閲覧済み・チェック済み状態を復元する | **削除**。`sessionStorage` を使わなくなるため。代わりに「モーダルを閉じてもチェック状態が残る」テストを新設する |

- [ ] **Step 1: Write the failing test**

`tests/login-consent-form.test.tsx` を次の内容に置き換える。

```tsx
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { LoginConsentForm } from "@/components/login-consent-form";

function elements() {
  return {
    submit: screen.getByRole("button", { name: "Google でログイン" }),
    termsButton: screen.getByRole("button", { name: "利用規約を読む" }),
    privacyButton: screen.getByRole("button", { name: "プライバシーポリシーを読む" }),
    termsBox: screen.getByRole("checkbox", { name: "利用規約に同意する" }),
    privacyBox: screen.getByRole("checkbox", { name: "プライバシーポリシーに同意する" })
  };
}

describe("LoginConsentForm", () => {
  it("書面を開くまでチェックできない（開いてもいない書面への同意は同意ではない）", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { submit, termsButton, termsBox, privacyBox } = elements();

    expect(termsBox).toBeDisabled();
    expect(privacyBox).toBeDisabled();
    expect(submit).toBeDisabled();

    fireEvent.click(termsButton);

    expect(termsBox).toBeEnabled();
    expect(privacyBox).toBeDisabled();
  });

  it("書面を開くとモーダルが出る", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);

    fireEvent.click(elements().termsButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "利用規約" })).toBeInTheDocument();
  });

  it("モーダルを閉じると、開いたボタンにフォーカスが戻る", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsButton } = elements();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(termsButton).toHaveFocus();
  });

  it("モーダルを閉じてもチェック状態は残る", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsButton, termsBox } = elements();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(termsBox);
    expect(termsBox).toBeChecked();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));

    expect(termsBox).toBeChecked();
  });

  it("書面を開くボタンの次に大きな同意操作へ進める", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { termsButton, termsBox } = elements();

    const position = termsButton.compareDocumentPosition(termsBox);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(termsBox.closest("label")).toHaveClass("min-h-11");
  });

  it("両方を開いて同意するまでログインできない", () => {
    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    const { submit, termsButton, privacyButton, termsBox, privacyBox } = elements();

    fireEvent.click(termsButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(termsBox);
    expect(submit).toBeDisabled();

    fireEvent.click(privacyButton);
    fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    fireEvent.click(privacyBox);

    expect(submit).toBeEnabled();
  });

  // 画面遷移が無くなったので、往復のあいだ状態を持ち越す仕組みは要らなくなった。
  it("sessionStorage を使わない", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    render(<LoginConsentForm action={vi.fn()} nextPath="/events" />);
    fireEvent.click(elements().termsButton);

    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/login-consent-form.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "利用規約を読む"`（現在はリンクのため）

- [ ] **Step 3: Write minimal implementation**

`components/login-consent-form.tsx` を次のように変える。

`ConsentRow` の `href` / `onOpened` を、モーダルを開くボタンに置き換える。`Link` の import は不要になる。

```tsx
function ConsentRow({
  name,
  label,
  linkLabel,
  onOpen,
  buttonRef,
  accepted,
  onAcceptedChange,
  opened
}: {
  name: string;
  label: string;
  linkLabel: string;
  onOpen: () => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  opened: boolean;
}) {
  return (
    <div className="grid gap-2">
      <span className={clsx(!opened && "text-muted")}>
        <button
          ref={buttonRef}
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 items-center gap-1 font-bold text-pine underline underline-offset-4 focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
        >
          {linkLabel}
        </button>
      </span>
      <label
        className={clsx(
          "flex min-h-11 items-center gap-3 rounded-control border border-line bg-surface px-3 py-2 text-body font-medium text-ink",
          !opened && "cursor-not-allowed text-muted opacity-60"
        )}
      >
        <input
          name={name}
          type="checkbox"
          aria-label={label}
          checked={accepted}
          disabled={!opened}
          onChange={(event) => onAcceptedChange(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-pine disabled:cursor-not-allowed"
        />
        <span>{label}</span>
      </label>
      <span aria-live="polite" className="sr-only">
        {opened ? label + "のチェックができるようになりました" : ""}
      </span>
    </div>
  );
}
```

`LoginConsentForm` 本体は次のようにする。`CONSENT_DRAFT_KEY`、`sessionStorage` の読み書き、`useEffect` による復元、`onSubmit` での削除をすべて取り除く。

```tsx
type OpenDocument = "terms" | "privacy" | null;

export function LoginConsentForm({
  action,
  nextPath,
  submitLabel = "Google でログイン"
}: {
  action: (formData: FormData) => void | Promise<void>;
  nextPath: string;
  submitLabel?: string;
}) {
  const [draft, setDraft] = useState(emptyConsentDraft);
  const [openDocument, setOpenDocument] = useState<OpenDocument>(null);
  const termsButtonRef = useRef<HTMLButtonElement>(null);
  const privacyButtonRef = useRef<HTMLButtonElement>(null);
  const lastOpenedRef = useRef<OpenDocument>(null);

  // モーダルを閉じたら、開くきっかけになったボタンへフォーカスを戻す。
  useEffect(() => {
    if (openDocument) {
      lastOpenedRef.current = openDocument;
      return;
    }

    if (!lastOpenedRef.current) {
      return;
    }

    const target = lastOpenedRef.current === "terms" ? termsButtonRef : privacyButtonRef;
    target.current?.focus();
    lastOpenedRef.current = null;
  }, [openDocument]);

  const updateDraft = (patch: Partial<ConsentDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  };

  const canSubmit = draft.termsAccepted && draft.privacyAccepted;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={nextPath} />
      <p className="text-body text-muted">
        利用規約とプライバシーポリシーの両方に同意すると、Googleログインへ進めます。
      </p>
      <div className="space-y-3 rounded-control border border-line bg-sunken p-4 text-body text-ink">
        <ConsentRow
          name="termsAccepted"
          label="利用規約に同意する"
          linkLabel="利用規約を読む"
          buttonRef={termsButtonRef}
          onOpen={() => {
            updateDraft({ termsOpened: true });
            setOpenDocument("terms");
          }}
          accepted={draft.termsAccepted}
          onAcceptedChange={(accepted) => updateDraft({ termsAccepted: accepted })}
          opened={draft.termsOpened}
        />
        <ConsentRow
          name="privacyAccepted"
          label="プライバシーポリシーに同意する"
          linkLabel="プライバシーポリシーを読む"
          buttonRef={privacyButtonRef}
          onOpen={() => {
            updateDraft({ privacyOpened: true });
            setOpenDocument("privacy");
          }}
          accepted={draft.privacyAccepted}
          onAcceptedChange={(accepted) => updateDraft({ privacyAccepted: accepted })}
          opened={draft.privacyOpened}
        />
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 py-2 text-body font-bold text-white shadow-soft transition-colors hover:bg-pine focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-subtle"
      >
        {submitLabel}
      </button>

      {openDocument === "terms" ? (
        <LegalModal
          title="利用規約"
          sections={TERMS_SECTIONS}
          pageHref="/terms"
          onClose={() => setOpenDocument(null)}
        />
      ) : null}

      {openDocument === "privacy" ? (
        <LegalModal
          title="プライバシーポリシー"
          sections={PRIVACY_SECTIONS}
          pageHref="/privacy"
          onClose={() => setOpenDocument(null)}
        />
      ) : null}
    </form>
  );
}
```

import に次を足す。`Link` と `CONSENT_DRAFT_KEY` は不要になるので消す。

```tsx
import React, { useEffect, useRef, useState } from "react";

import { LegalModal } from "@/components/legal-modal";
import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "@/lib/legal-documents";
```

`ConsentDraft` 型と `emptyConsentDraft` はそのまま残す（4つのフラグを引き続き使う）。

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/login-consent-form.test.tsx`
Expected: PASS（7 tests）

Run: `npm test`、`npx tsc --noEmit`、`npm run lint`、`npm run build`
Expected: すべて成功

- [ ] **Step 5: Commit**

```bash
git add components/login-consent-form.tsx tests/login-consent-form.test.tsx
git commit -m "feat: read legal documents in a modal from the consent form"
```

---

## 完了後の確認

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

着手前の基準線は 144ファイル 707テスト。このプランで Task 1 が5件、Task 2 が7件を足し、Task 3 は既存7件を7件に置き換える（増減なし）。**146ファイル 719テスト**が目安になる。
