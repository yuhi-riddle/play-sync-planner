# Madoi UI/UX ブラッシュアップ実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** リリース前に主要導線13画面の見た目・文言・導線・スマホ幅を磨き、本番で安心して使える品質にする。

**Architecture:** 診断→合意→修正→実機確認の4段階。フェーズ1でコード診断して重要度つき問題リストを作り、ユーザー合意後に修正タスクをこの計画に追記して実行する。最後に dev server + Playwright で実機確認する。

**Tech Stack:** Next.js 15 (App Router) / React 19 / Tailwind CSS 3 / vitest + testing-library / Playwright MCP

## Global Constraints

- 既存デザイントーン(cream/moss/ink/mist/clay/pine の和風パレット、globals.css 定義)を維持する
- 導線変更・小さな新規画面はスペックで承認済み。DB スキーマ変更は軽微なものでもユーザーに相談してから行う
- 既存 vitest スイート(200件)を常にグリーンに保つ。テストコマンドは `npm.cmd test`(全体)/ `npx.cmd vitest run <file>`(個別)
- 文言はすべて日本語。です・ます調で既存文言のトーンに合わせる
- スマホ幅の目安は 375px。タップ領域は最小 44px(既存コードは min-h-11 / h-11 を使用)
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## 画面とコンポーネントの対応

| 導線グループ | ページ | 主なコンポーネント |
|---|---|---|
| A. 入口+ホーム | `app/login/page.tsx`, `app/page.tsx` | `home-month-calendar.tsx`, `home-selected-date-agenda.tsx`, `auth-nav.tsx`, `home-return-link.tsx` |
| B. イベント | `app/events/page.tsx`, `app/events/new/page.tsx`, `app/events/[eventId]/page.tsx`, `app/events/[eventId]/edit/page.tsx` | `event-form.tsx`, `share-link-card.tsx` |
| C. 予定作成 | `app/events/[eventId]/plans/new/page.tsx`, `app/plans/[planId]/edit/page.tsx` | `plan-form.tsx`, `calendar-availability-panel.tsx`, `adjustment-calendar-view.tsx`, `adjustment-month-picker.tsx` |
| D. 回答 | `app/s/[token]/answer/page.tsx`, `app/s/[token]/answer/complete/page.tsx` | `answer-form.tsx` |
| E. 確定+清算 | `app/plans/[planId]/page.tsx`, `app/plans/[planId]/confirm/page.tsx`, `app/plans/[planId]/settlement/page.tsx`, `app/s/[token]/settlement/page.tsx` | `confirm-form.tsx`, `expense-form.tsx`, `public-settlement-summary.tsx`, `settlement-confirmation-queue.tsx`, `settlement-progress-steps.tsx`, `settlement-completion-notice.tsx`, `payment-method-field.tsx`, `payment-destination-link.tsx`, `paypay-action-panel.tsx`, `reminder-message-card.tsx`, `settlement-reminder-card.tsx`, `settlement-status-badge.tsx`, `payment-recorded-notice.tsx` |
| F. 通知+設定 | `app/notifications/page.tsx`, `app/settings/page.tsx` | `calendar-connection-card.tsx`, `account-email-card.tsx`, `calendar-share-link.tsx` |
| 共通 | `app/layout.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/globals.css` | `ui.tsx`, `state-panels.tsx` |

---

### Task 1: コード診断と問題リスト作成

**Files:**
- Read: 上表の全ページ・コンポーネント(グループ単位で読む)
- Create: `docs/superpowers/plans/2026-07-08-ui-ux-brushup-findings.md`

**Interfaces:**
- Produces: 重要度つき問題リスト(Task 2 の合意対象、Task 3 の修正タスクの元)

- [ ] **Step 1: frontend-design-fix-sync スキルを読み込む**

Skill ツールで `frontend-design-fix-sync` を起動し、診断観点を把握する。

- [ ] **Step 2: グループ A(入口+ホーム)を診断する**

対象ファイルを読み、次の観点でメモを取る:
1. AIっぽい定型スタイル(無個性なカード羅列、意味のないグラデーション等)
2. 状態の欠落: hover / focus-visible / empty(データ0件) / error / loading
3. 文言: 主語が不明、専門用語、次に何をすればよいか分からない
4. 導線: ユーザーが迷う流れ、行き止まり(戻れないページ)、押せそうで押せない要素
5. スマホ幅 375px での崩れ・タップしにくさ(コードから判断できる範囲: 固定幅、横並びの詰まり、`sm:` ブレークポイントの欠落)

- [ ] **Step 3: グループ B〜F を同じ観点で診断する**

グループごとに Step 2 と同じ観点で診断する。清算(グループE)はスペックの重点項目「支払う側・受け取る側が迷わないか」を特に見る。通知(グループF)は「通知文面が分かりやすいか」を特に見る。

- [ ] **Step 4: 問題リストを書く**

`docs/superpowers/plans/2026-07-08-ui-ux-brushup-findings.md` に以下の形式で書く:

```markdown
# UI/UX 診断結果

## 高(直さないとユーザーが迷う・困る)
- [ ] G-E-1: (画面) (問題) → (修正案)

## 中(直すと明確に良くなる)
- [ ] G-A-1: ...

## 低(好みの範囲・余裕があれば)
- [ ] G-B-1: ...
```

ID は `G-<グループ>-<連番>`。各項目に対象ファイルパスと修正案を必ず書く。

- [ ] **Step 5: コミット**

```bash
git add docs/superpowers/plans/2026-07-08-ui-ux-brushup-findings.md
git commit -m "docs: add UI/UX diagnosis findings"
```

### Task 2: 問題リストのユーザー合意(ゲート)

**Files:**
- Read: `docs/superpowers/plans/2026-07-08-ui-ux-brushup-findings.md`
- Modify: 同ファイル(合意結果を反映)

**Interfaces:**
- Consumes: Task 1 の問題リスト
- Produces: 合意済み修正項目リスト(チェックボックスで採用/不採用をマーク)

- [ ] **Step 1: 問題リストをユーザーに提示する**

高・中・低の件数と代表例をターミナルで要約する。レイアウト変更や導線変更を含む項目は、ビジュアルコンパニオン(起動済み: `.superpowers/brainstorm/` セッション)にモックを描いて見せる。

- [ ] **Step 2: 採用項目を確定する**

AskUserQuestion またはユーザーの返信で、どの重要度まで直すか・除外項目はどれかを確定し、findings ファイルに反映してコミットする。

```bash
git add docs/superpowers/plans/2026-07-08-ui-ux-brushup-findings.md
git commit -m "docs: mark agreed UI/UX fixes"
```

### Task 3: 合意した修正の実施(診断後に具体タスクを追記)

**このタスクは Task 2 完了後に、合意項目を Task 3.1, 3.2, … としてこの計画ファイルへ追記してから実行する。** 追記する各タスクは次の型に従う:

**Files:**
- Modify: (findings の該当ファイルパス)
- Test: 対応する `tests/*.test.tsx`(存在する場合は更新、UI 挙動を変える場合は追加)

**修正タスクの型(全 Task 3.x 共通のステップ):**

- [ ] **Step 1: 挙動が変わる場合は失敗するテストを先に書く**(見た目だけの変更はテスト不要)
- [ ] **Step 2: 修正を実装する**(グローバル制約のパレット・文言トーン・44px タップ領域を守る)
- [ ] **Step 3: 関連テストを実行する** `npx.cmd vitest run tests/<対象>.test.tsx` → PASS
- [ ] **Step 4: findings の該当項目にチェックを付ける**
- [ ] **Step 5: 修正のまとまり(同一画面・同一グループ)ごとにコミット**

```bash
git add <変更ファイル> docs/superpowers/plans/2026-07-08-ui-ux-brushup-findings.md
git commit -m "fix: <画面名> <修正内容の要約>"
```

### Task 4: 実機確認(visual-qa)

**Files:**
- Read: 全画面(ブラウザ経由)
- Modify: 発見した問題の該当ファイル

**Interfaces:**
- Consumes: Task 3 完了後のコード

- [ ] **Step 1: dev server を起動する**

```powershell
npm.cmd run dev
```

バックグラウンドで起動し、http://localhost:3000 の応答を確認する。

- [ ] **Step 2: ユーザーに Google ログインを依頼する**

Playwright MCP でブラウザを開き、ユーザーに「開いたブラウザで Google ログインしてください」と依頼して待つ。

- [ ] **Step 3: visual-qa スキルで全画面を確認する**

Skill ツールで `visual-qa` を起動し、主要導線13画面をデスクトップ幅(1280px)とスマホ幅(375px)でスクリーンショット確認する。テストデータが無い場合は画面上から作成する(イベント→予定→回答→清算の一連)。

- [ ] **Step 4: 発見した問題を修正する**

Task 3 の修正タスクの型に従って直し、画面ごとにコミットする。

### Task 5: アクセシビリティ確認

- [ ] **Step 1: accessibility スキルで診断する**

Skill ツールで `accessibility` を起動し、Task 3 で変更したファイルを対象にキーボード操作・フォーカス管理・ARIA を確認する。

- [ ] **Step 2: 問題があれば修正してコミットする**

```bash
git add <変更ファイル>
git commit -m "fix: address accessibility issues in brushed-up screens"
```

### Task 6: 最終検証とドキュメント更新

- [ ] **Step 1: 全テストを実行する**

Run: `npm.cmd test`
Expected: 200件以上すべて PASS

- [ ] **Step 2: 本番ビルドを実行する**

Run: `npm.cmd run build`
Expected: エラーなく完了

- [ ] **Step 3: docs/current-status.md を更新する**

「できれば確認する」セクションの4項目(画面文言と導線 / スマホ幅 / 通知文面 / 清算ページ導線)に対応状況を反映する。

- [ ] **Step 4: コミット**

```bash
git add docs/current-status.md
git commit -m "docs: record UI/UX brushup completion"
```
