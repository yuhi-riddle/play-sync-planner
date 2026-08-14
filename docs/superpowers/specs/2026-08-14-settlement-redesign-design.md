# 清算画面リデザイン（リデザイン第2弾）

作成: 2026-08-14

## 背景

リデザイン第1弾（PR #13、`worktree-redesign+mobile-plan-flow` ブランチ）で
`plan-form.tsx` の STEP表示・`answer-form.tsx` の回答セグメント・共通 `Button` プリミティブを整えた。
第1弾は plan mode 上のプラン運用のみで、design doc としては作成していない。
続けて画面を洗い出したところ、清算（せいさん）画面 `app/plans/[planId]/settlement/page.tsx` に
第1弾と同種の未対応箇所が集中していた。

- `components/settlement/settlement-progress-steps.tsx` が、第1弾で直した plan-form の STEP表示と
  **同じ「3枚カードグリッド」パターン**のまま残っている
- 「既読にする」「受け取り確認する」「送金先を保存」など、生 `<button>` のクラス文字列重複が
  他画面より多い（6箇所以上）
- `bg-mist/42`・`bg-mist/45` など、`design/rules.md` が禁じる半透明面が複数箇所に残っている

トーン（暖色ベージュ系トークンを維持し装飾を削ぐ）とスマホ優先方針は第1弾を踏襲する。
新しい色・部品・パターンは足さない。

## スコープ

- `app/plans/[planId]/settlement/page.tsx`（清算画面本体、オーナー向け）
- `components/settlement/settlement-progress-steps.tsx`
- `components/settlement/settlement-confirmation-queue.tsx`
- `app/notifications/page.tsx` の「既読にする」ボタン（同じ重複パターンのため、ついでに揃える）

### スコープ外

- `app/s/[token]/settlement/page.tsx`（`PublicSettlementSummary` という別コンポーネントを使用）
  および `components/settlement/public-settlement-summary.tsx` — 未調査のため今回は対象外。
  必要になれば別途調査してから第3弾として切り出す
- ホームカレンダーの週表示グリッド（`home-selected-date-agenda.tsx`）— 次点候補として認識しているが、
  今回は清算画面に絞る
- `design/tokens.css` / `tailwind.config.ts` の変更（既存トークンの範囲内で実装）

## 変更内容

### 1. `settlement-progress-steps.tsx` — 横型ドットプログレスに統一

現状（45-65行目）は `<ol className="grid gap-3 md:grid-cols-3">` で
「支払い待ち／受け取り確認待ち／完了」の3ステップをカード状に並べている。

第1弾で `plan-form.tsx` に導入したドットプログレス（丸番号＋接続線を横一列、現在ステップの
詳細のみテキスト表示）と同じ構造に置き換える。

- 3状態のトーンは既存の `StepTone`（`current` / `done` / `waiting`）をそのまま使う
- 各ステップの `detail`（「参加者の支払いを待っています。」等）は、現在ステップの分だけ
  ドット下にテキスト表示。他ステップは `sr-only` に格納
- `countLabel`（件数）は現在ステップのテキストに含める

plan-form 版と異なり、ここは「進む／戻る」がなく状態表示のみなので、ステップ番号のタップ操作は
持たせない（読み取り専用の進捗表示のまま）。

### 2. 半透明面の解消

`design/rules.md` の「面は3段（`bg-canvas` / `bg-surface` / `bg-sunken`）、必ず不透明」に反する
半透明背景を修正する。

- `settlement-progress-steps.tsx` 69行目 `bg-mist/42` → `bg-mist`
- `settlement-progress-steps.tsx` 70行目 `border-moss/20` → `border-moss/32`（線は元々半透明許容だが、
  `current` トーンの `border-moss/32` と統一し使い分けを明確にする）
- `settlement/page.tsx` 内の `bg-mist/45`（363, 502, 703, 731行目）→ `bg-mist`
- `notifications/page.tsx` 136行目 `bg-mist/55` → `bg-mist`

見た目のトーン自体は変えず、「半透明で背景が透ける」状態だけをなくす。

### 3. 共通 `Button` / `SubmitButton` への置換

第1弾で `components/ui/server.tsx` に作った `Button`、`components/ui/client.tsx` の
`SubmitButton` を使い、生 `<button>` のクラス文字列重複を解消する。

置換対象（代表例、いずれも `type="submit"` で `variant` は既存の見た目に合わせる）:

- `notifications/page.tsx` 153-159行目「既読にする」→ `SubmitButton variant="secondary"`
- `settlement-confirmation-queue.tsx` 46-53行目「受け取り確認する」→ `SubmitButton`
- `settlement/page.tsx` 546-553行目「この支払いを削除」→ `SubmitButton variant="secondary"`
  （危険操作だが、色は既存の `text-clay-ink` 系クラスを `className` で維持）
- `settlement/page.tsx` 768-774行目「送金先を保存」→ `SubmitButton variant="secondary"`

`<details><summary>` 内の開閉トリガー（「内容を編集」「送金先を設定」等）はボタンではなく
開閉UIなので対象外とする。

## 変更しないもの

- `SettlementStatusBadge` / `Badge` まわり（既に `rules.md` 準拠）
- `settlement/page.tsx` の情報構成・カード分割（Card が多い点は認識しているが、今回は
  表示要素の修正に留め、画面構成の再設計はスコープ外）
- `PublicSettlementSummary` とその配下（前述の通り別コンポーネント、未調査）

## 実装順序

1. `settlement-progress-steps.tsx` のドットプログレス化（独立、他への影響なし）
2. 半透明面の修正（`settlement-progress-steps.tsx`、`settlement/page.tsx`、`notifications/page.tsx`）
3. `notifications/page.tsx` の Button 置換
4. `settlement-confirmation-queue.tsx` の Button 置換
5. `settlement/page.tsx` の Button 置換（削除・送金先保存）
6. 検証

## テスト方針

- `tests/settlement/settlement-progress-steps.test.tsx` の既存アサーションを
  新しいドットプログレスのDOM構造に合わせて更新
- `tests/settlement/settlement-confirmation-queue.test.tsx`、
  `tests/settlement/settlement-page.test.tsx` の button 関連アサーション（`role="button"` や
  クラス名検証）を `Button`/`SubmitButton` 使用後の構造に合わせて更新
- `npm run typecheck` / `npm test` / `npm run build`

## 実機での確認観点

- 清算画面の進捗表示が、plan-formのSTEP表示と同じ視覚言語（現在/完了/未来の3状態）で
  表示されること
- 「受け取り確認する」「既読にする」等のボタンが、見た目・disabled/pending挙動とも
  変更前と一致していること
- 半透明修正後もカード面と背景の区別が明瞭であること（意図せず濃くなりすぎていないか）
