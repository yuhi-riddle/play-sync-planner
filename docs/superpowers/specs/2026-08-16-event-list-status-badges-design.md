# イベント一覧 状態バッジ改善（リデザイン第4弾）

作成: 2026-08-16

## 背景

リデザイン第1〜3弾（PR #13、STEP表示・回答セグメント・共通Buttonプリミティブ、清算画面の進捗ドット化、ホーム週表示グリッド）に続く第4弾。当初「プラン一覧」を対象と想定していたが、実際には`app/plans/page.tsx`は月カレンダー画面（タイトルも「カレンダー」）であり、カード一覧としての「プラン一覧」に近いものは存在しなかった。実コードを確認した結果、対象は`app/events/page.tsx`（イベント一覧）に絞り、そこで見つかった以下の実質的な問題を今回のスコープとする。

1. **状態バッジが7種類あるのに全て同じ配色**: `EventDisplayState`（`lib/domain/event/event-filter.ts`）は`participant_waiting`・`schedule_creation_waiting`・`answer_waiting`・`event_waiting`・`settlement_waiting`・`completed`・`cancelled`の7種類あるが、`EventCard`（`app/events/page.tsx`）は全状態を`bg-mist text-pine`の同一配色で表示している。一覧で見ても「完了」と「中止」が見分けられない。
2. **状態を表すピルが3箇所で自前実装・重複している**: 既に`components/ui/server.tsx`に共有`Badge`コンポーネント（`tone`: neutral/info/warn/accent/done）が存在し他画面（ホーム等）で使われているが、`app/events/page.tsx`内の(a)下書きバッジ（179行目）、(b)下書きのカテゴリタグ（193行目）、(c)`EventCard`の状態バッジ（225行目）はいずれも`Badge`を使わずクラス文字列を直接書いており、3箇所とも微妙に異なる実装になっている。

トーン（暖色ベージュ系トークンを維持し装飾を削ぐ）とスマホ優先方針は前弾を踏襲する。

## スコープ

- `app/events/page.tsx`（`EventCard`関数と、下書きカードのバッジ2箇所）

### スコープ外

- `components/event/event-list-controls.tsx`（状態フィルターのチップ・検索欄・ページネーション。これらは`<Link>`ベースのナビゲーション要素であり、今回の「状態バッジの重複・無色分け」とは別種の問題のため対象外）
- `app/plans/page.tsx`（月カレンダー画面。「プラン一覧」ではないと判明したため対象外）
- `app/events/[eventId]/page.tsx`内の日程調整プランリスト（別画面、今回は含めない）
- `components/ui/server.tsx`の`Badge`コンポーネント自体（既存の5トーンをそのまま使う。新しいトーンの追加はしない）
- `design/tokens.css` / `tailwind.config.ts`

## 変更内容

### 1. 状態バッジを共有`Badge`コンポーネントに統一

`EventCard`内の自前ピル（225-227行目）を`Badge`に置き換える。

```tsx
// 変更前
<span className="inline-flex rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
  {eventDisplayStateLabels[summary.displayState]}
</span>
```

```tsx
// 変更後
<Badge tone={eventDisplayStateTones[summary.displayState]}>
  {eventDisplayStateLabels[summary.displayState]}
</Badge>
```

下書きバッジ（179-181行目）も同様に置き換える。

```tsx
// 変更前
<div className="mb-3 inline-flex rounded-full border border-honey/45 bg-honey/18 px-3 py-1 text-xs font-bold text-honey-ink">
  下書き
</div>
```

```tsx
// 変更後
<div className="mb-3">
  <Badge tone="info">下書き</Badge>
</div>
```

下書きのカテゴリタグ（193-195行目）も置き換える。`Badge`は状態専用のコンポーネントではなくピル表示の共通部品なので、カテゴリ表示にも使う。見た目は現状の`bg-mist text-pine`から`Badge tone="done"`（`bg-mist text-pine` + `border-moss/30`）に変わり、うっすらとした境界線が付くだけの些細な差分（前弾の共通コンポーネント統一時に許容してきたのと同種の変化）。

```tsx
// 変更前
<span className="rounded-full bg-mist px-3 py-1 text-xs font-bold text-pine">
  {draftCategory === "all" ? "カテゴリ未設定" : categoryLabels[draftCategory]}
</span>
```

```tsx
// 変更後
<Badge tone="done">
  {draftCategory === "all" ? "カテゴリ未設定" : categoryLabels[draftCategory]}
</Badge>
```

### 2. 状態ごとの色分け（7状態→5トーン対応表）

`app/events/page.tsx`に、`EventDisplayState`から`BadgeTone`への対応表を追加する。既存の5トーンのみを使い、新しいトーンは追加しない。ユーザーとの確認を経て、以下の対応で確定（清算待ちと中止は初期案から入れ替え済み）。

```tsx
const eventDisplayStateTones: Record<EventDisplayState, BadgeTone> = {
  participant_waiting: "neutral",       // まだ動きがない初期段階
  schedule_creation_waiting: "info",    // オーナーの対応待ち・進行中
  answer_waiting: "info",               // 調整中
  event_waiting: "accent",              // 日程確定・あとは当日を待つだけ
  settlement_waiting: "neutral",        // ルーティンな待ち
  completed: "done",                    // 確定・完了(現状維持)
  cancelled: "warn"                     // 目立つ色で異常系だと伝える
};
```

`EventDisplayState`と`BadgeTone`は両方とも既存の型（`lib/domain/event/event-filter.ts`と`components/ui/server.tsx`）をそのままimportして使う。

## 変更しないもの

- `event-list-controls.tsx`の状態フィルターチップ・検索欄・ページネーション
- `EventCard`のレイアウト構造・アイコン（`CalendarDays`/`MapPin`/`UsersRound`）
- `Badge`コンポーネント自体（5トーンの定義・見た目）
- `design/tokens.css` / `tailwind.config.ts`

## 実装順序

1. `eventDisplayStateTones`対応表を追加し、`EventCard`の状態バッジを`Badge`に置き換え（独立、他への影響なし）
2. 下書きバッジを`Badge tone="info"`に置き換え
3. 下書きのカテゴリタグを`Badge tone="done"`に置き換え
4. 検証

## テスト方針

- `tests/event/events-page.test.tsx`を確認。既存テストは`bg-mist`等の生クラス名を直接アサートしていないため、置き換えによる既存テストの破壊は想定していない（要確認）
- 新規テストとして、状態ごとに異なる`tone`のクラスが付くことを検証する（少なくとも`completed`と`cancelled`が異なる配色になることを確認するテストを追加）
- `npm run typecheck` / `npm test` / `npm run build`
- 実機確認: イベント一覧で「完了」「中止」「清算待ち」等、複数状態のイベントが混在した状態で並べ、色で見分けられるか確認

## 実機での確認観点

- 「完了」と「中止」が、一覧上ひと目で異なる色だと分かること
- 「清算待ち」がルーティンな待ち（neutral）に見え、「中止」が目立つ色（warn/clay）で異常系だと伝わること
- 下書きカード・カテゴリタグの見た目が、`Badge`統一後も大きく崩れていないこと（カテゴリタグにうっすら境界線が付く差分のみ許容範囲）
