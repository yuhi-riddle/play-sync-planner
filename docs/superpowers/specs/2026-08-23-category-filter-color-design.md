# イベント一覧のカテゴリ絞り込みに色を出す

## 背景

イベントカテゴリの差し色機能(`lib/domain/event/category-color.ts`、8色)は、一覧カードの左帯・詳細ページ見出しのアイコンバッジには実装済み(`docs/superpowers/specs/2026-08-21-event-category-accent-colors-design.md`、`docs/superpowers/specs/2026-08-22-category-accent-expansion-design.md`)。残っているのは「カテゴリの絞り込みUIに色を出す」部分。

`/events` の実際のカテゴリ絞り込みは `components/event/event-list-controls.tsx` 内、状態チップとは別に `<details>` で畳んだ `<form>` の中にある `<select name="category">`。ネイティブ `<select>` の `<option>` には色を乗せられない(ブラウザ実装依存で信頼できない)ため、`<select>` 自体は残しつつ周辺に色を添える方向で検討した(検討経緯は `docs/superpowers/specs/2026-08-23-category-filter-color-followup-prompt.md` を参照)。

## 目的

畳んだ「条件を変える」を開いたときに、選択中のカテゴリが色でひと目でわかるようにする。実装コストは最小限に抑える(「カテゴリ絞り込み自体は必要だが、凝ったUI刷新までは要らない」という判断)。

## スコープ

**対象**

- `components/event/event-list-controls.tsx` の `<details>` 内、カテゴリの `<select>` とその `<label>`

**対象外**

- 状態チップ(進行中/下書き/完了/中止)への色付け。理由: 状態の色分けは既に一覧カードのバッジ側で実装済み(`docs/superpowers/specs/2026-08-16-event-list-status-badges-design.md`、`Badge tone` による5トーンの意味づけ色)。当時の設計でもフィルタチップは「`<Link>` ベースのナビゲーション要素で、バッジの色分けとは別種の問題」として明示的にスコープ外にされている。カテゴリの色は「種類を区別する」装飾色、状態の色は「良い/悪い/待ち」を伝える意味づけ色であり、性質が異なるものを同じフィルタの帯に混ぜると読み取りにくくなる。
- 表示順・表示件数の `<select>` への色付け。対象外(色を持つ属性ではない)。
- 畳んでいる状態(summary)の見た目変更。開く前の初期表示は現状のまま変えない(2026-08-03の設計判断=「375pxで縦積みのselect4つが629pxを使い、ファーストビューを潰した」事故の反省を踏襲する)。
- カテゴリ絞り込みのUIをチップ形式やカスタムのカラードロップダウンに置き換えること。孤立コードの `components/event/event-category-filter.tsx` は今回使わない。

## 設計

「条件を変える」を開いたフォーム内、カテゴリの `<label>` 直後に選択中カテゴリの色ドットを1つ追加し、`<select>` の枠線・背景を同じ色でうっすら染める。

- カテゴリが `"all"` のときは色を付けない(現状のニュートラルな見た目のまま)。
- 色は `categoryAccent(query.category).dot` など、`lib/domain/event/category-color.ts` の既存トークンをそのまま使う。新規カラートークンは追加しない。
- `<select>` 自体の構造・`<option>` 一覧・送信先(`action="/events"`)は変更しない。選ぶ操作は今までどおりプルダウン。
- 新規コンポーネント・`"use client"` 化は不要。既存のサーバーコンポーネントの JSX に数行足すだけで完結する。

## 実装対象ファイル

- `components/event/event-list-controls.tsx`(カテゴリの `<label>` と `<select>` 周りのみ)
- 必要であれば `lib/domain/event/category-color.ts` から `categoryAccent` を import する(新規追加ではなく既存関数の再利用)

## テスト方針

- 既存の `EventListControls` 関連テスト(あれば)が壊れていないことを確認
- カテゴリが `"all"` のとき色が付かないこと、カテゴリを選んだとき対応する色が付くことを確認するテストを追加
- 実機確認: 375px幅で「条件を変える」を開閉し、初期表示の高さが変わらないこと・開いたときに色が見えることを目視確認
