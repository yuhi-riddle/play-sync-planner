# 清算画面リデザイン（リデザイン第2弾）

作成: 2026-08-14

## 背景

リデザイン第1弾（PR #13、`worktree-redesign+mobile-plan-flow` ブランチ）で
`plan-form.tsx` の STEP表示・`answer-form.tsx` の回答セグメント・共通 `Button` プリミティブを整えた。
続けて画面を洗い出したところ、清算（せいさん）画面 `app/plans/[planId]/settlement/page.tsx` に
第1弾と同種の未対応箇所が集中していた。

- `components/settlement/settlement-progress-steps.tsx` が、第1弾で直した plan-form の STEP表示と
  **同じ「3枚カードグリッド」パターン**のまま残っている
- 「既読にする」「受け取り確認する」など、生 `<button>` のクラス文字列重複が他画面より多い
- `bg-mist/42`・`bg-mist/45` など、`design/rules.md` が禁じる半透明面が複数箇所に残っている

トーン（暖色ベージュ系トークンを維持し装飾を削ぐ）とスマホ優先方針は第1弾を踏襲する。
新しい色は足さないが、危険操作用のボタンvariantは1つ新設する（後述）。

`SettlementProgressSteps` はオーナー向け清算画面だけでなく、共有リンクの参加者向け公開ページ
（`app/s/[token]/settlement` → `PublicSettlementSummary`）からも同じpropsで呼ばれている共通コンポーネント。
両ページとも同じ `app/layout.tsx`（`max-w-[1440px]`）配下で同じ `Card` に包まれており、レイアウト・幅の差はない。
そのため本コンポーネントの変更は、公開ページ側のコード変更なしに両方へ反映される。

## スコープ

- `components/settlement/settlement-progress-steps.tsx`（オーナー画面・公開参加者画面の両方に自動反映）
- `app/plans/[planId]/settlement/page.tsx`（半透明面の修正、削除ボタンの置換）
- `components/settlement/settlement-confirmation-queue.tsx`
- `app/notifications/page.tsx`（半透明面の修正、既読ボタンの置換）
- `components/ui/server.tsx`（`Button` に `variant="danger"` を新設）

### スコープ外

- `app/s/[token]/settlement/page.tsx` / `components/settlement/public-settlement-summary.tsx` への
  直接のコード変更 — `SettlementProgressSteps` 経由で自動的に反映されるため、このファイル自体の変更は不要
- `settlement/page.tsx` の「送金先を保存」ボタン — 同種の置換候補だが今回は見送り、次回以降に回す
- ホームカレンダーの週表示グリッド（`home-selected-date-agenda.tsx`）— 次点候補として認識しているが、
  今回は清算画面に絞る
- `design/tokens.css` / `tailwind.config.ts` の色トークン変更（`danger` variant は既存の `clay` / `clay-ink` を使う）

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

- `settlement-progress-steps.tsx` の `bg-mist/42` → `bg-mist`
- `settlement-progress-steps.tsx` の `border-moss/20` → `border-moss/32`（`current` トーンの
  枠線と統一し使い分けを明確にする）
- `settlement/page.tsx` 内の `bg-mist/45`（複数箇所）→ `bg-mist`
- `notifications/page.tsx` の `bg-mist/55` → `bg-mist`

見た目のトーン自体は変えず、「半透明で背景が透ける」状態だけをなくす。実装時に対象箇所の行番号を
grepし直してから直す（このdoc記載の行番号はズレる可能性がある）。

### 3. 共通 `Button` への統一 + `variant="danger"` 新設

第1弾で `components/ui/server.tsx` に作った `buttonVariantClasses`（`primary` / `secondary`）に、
新しく `danger` を追加する。

```ts
danger: "border border-clay/45 bg-surface text-clay-ink hover:bg-clay hover:text-white"
```

置換対象:

- `notifications/page.tsx`「既読にする」→ `SubmitButton variant="secondary"`（見た目は不変）
- `settlement-confirmation-queue.tsx`「受け取り確認する」→ `SubmitButton`（`primary`、見た目は不変）
- `settlement/page.tsx`「この支払いを削除」→ `SubmitButton variant="danger"`（見た目は不変）

危険操作（削除）を `secondary` + `className` の上書きで済ませず専用 `variant` にする理由:
Tailwindは生成後CSSの規則順でスタイルが決まり、`className` で渡した上書きクラスが必ずしも
`variant` のクラスに勝つとは限らない。専用variantなら上書き合戦が起きず安全。

`<details><summary>` 内の開閉トリガー（「内容を編集」「送金先を設定」等）はボタンではなく
開閉UIなので対象外とする。

## 変更しないもの

- `SettlementStatusBadge` / `Badge` まわり（既に `rules.md` 準拠）
- `settlement/page.tsx` の情報構成・カード分割（Card が多い点は認識しているが、今回は
  表示要素の修正に留め、画面構成の再設計はスコープ外）
- `app/s/[token]/settlement/page.tsx` / `public-settlement-summary.tsx` 自体のコード（前述の通り
  直接変更しなくても反映される）
- 「送金先を保存」ボタン（次回以降）

## 実装順序

1. `components/ui/server.tsx` に `variant="danger"` を追加（土台、他への影響なし）
2. `settlement-progress-steps.tsx` のドットプログレス化
3. 半透明面の修正（`settlement-progress-steps.tsx`、`settlement/page.tsx`、`notifications/page.tsx`）
4. `notifications/page.tsx` の Button 置換
5. `settlement-confirmation-queue.tsx` の Button 置換
6. `settlement/page.tsx` の削除ボタンを `variant="danger"` に置換
7. 検証

## テスト方針

- `tests/settlement/settlement-progress-steps.test.tsx` の既存アサーションを
  新しいドットプログレスのDOM構造に合わせて更新
- `tests/settlement/settlement-confirmation-queue.test.tsx`、`tests/settlement/settlement-page.test.tsx`、
  通知関連テストの button クラス名検証を `Button`/`SubmitButton` 使用後の構造に合わせて更新
- `npm run typecheck` / `npm test` / `npm run build`

## 実機での確認観点

- 清算画面の進捗表示が、plan-formのSTEP表示と同じ視覚言語（現在/完了/未来の3状態）で
  表示されること。**オーナー画面・共有リンクの参加者画面（`/s/[token]/settlement`）の両方**で確認する
- 「受け取り確認する」「既読にする」「この支払いを削除」のボタンが、見た目・disabled/pending挙動とも
  変更前と一致していること（削除ボタンは新variantでも同じ危険色に見えること）
- 半透明修正後もカード面と背景の区別が明瞭であること（意図せず濃くなりすぎていないか）
