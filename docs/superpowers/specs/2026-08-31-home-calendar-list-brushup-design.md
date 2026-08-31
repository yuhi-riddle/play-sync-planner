# ホーム・カレンダー・一覧の手直し（Batch A）設計

作成日: 2026-08-31
比較シート: `design/proposals/2026-08-31-home-calendar-list-brushup.html`

## 背景

ユーザー目線のフィードバックのうち、影響が局所的なものを Batch A としてまとめる。
ナビ再設計（通知をヘッダーから下部ナビへ／モバイルを左ドロワーに）は範囲が広くリスクも高いので、
別の設計・比較シートで扱う（Batch B）。

イベント作成導線は「特に不満はない、確認したかっただけ」だったので対象外。

## スコープ

| # | 内容 | 種別 |
|---|---|---|
| 1 | ホーム「次の予定」を必ず出す | ロジック |
| 2 | イベント一覧のフィルターに境界をつける | 見た目＋開閉 |
| 3 | カレンダーに「今日」ボタン | 機能追加 |
| 4 | カレンダーの直近予定バー | **見送り**（ホームの #1 で対応） |
| 5 | カレンダーの選択日を分かりやすく（案A・塗りつぶし） | 見た目 |
| 6 | カレンダーの土日祝の背景色を全廃（案A） | 見た目 |
| 7 | 月ピッカーを Madoi 流に（12ヶ月グリッド＋年ホイール） | 作り替え |

---

## 1. ホーム「次の予定」を必ず出す

### 現状

- `app/page.tsx` が `findNextConfirmedItem(calendarItems, new Date())`（`lib/domain/home/home-calendar.ts:141`）で
  **`kind === "confirmed"`** かつ今日以降の項目だけを拾う。
- 確定済みイベントが無い（調整中しかない）ユーザーは `HomeNextConfirmedEventCard` が丸ごと非表示になり、
  ホームが「作成CTA ＋ 選択日の予定」だけになって寂しい。

### 変更

- `home-calendar.ts` に `findNextUpcomingItem(items, now)` を追加する。
  - まず `kind === "confirmed"` の今日以降で最も近いものを探す（現行 `findNextConfirmedItem` と同じ）。
  - 無ければ `kind === "collecting"` の今日以降で最も近いものを返す。
  - どちらも無ければ `null`。
- `findNextConfirmedItem` は残す（他に参照が無ければ削除可。要 grep 確認）。
- `HomeNextConfirmedEventCard` を `HomeNextUpcomingEventCard` にリネーム、または現行のまま props で分岐:
  - `item.kind === "confirmed"` → バッジ `done` / 文言「確定済み」（現行どおり）
  - `item.kind === "collecting"` → バッジ `info`(honey) / 文言「調整中」
  - カード上部のラベルは常に「次の予定」。
  - CTA リンク文言: 確定「詳細を見る」／調整中「日程を確認する」。
- `app/page.tsx` は `findNextUpcomingItem` を呼ぶよう差し替え。

### 既知の制約

`list_calendar_items` は表示月＋前後バッファしか返さない（migration 034）。
次の予定が 2ヶ月以上先だと拾えない。バッファ幅の拡張は Batch A では触らず、必要なら follow-up。

### 対象ファイル

- `lib/domain/home/home-calendar.ts`
- `components/home/home-next-confirmed-event-card.tsx`
- `app/page.tsx`
- `tests/home/home-calendar.test.ts`

### 受け入れ条件

- 確定 0 件・調整中あり → 「次の予定」カードに直近の調整中が「調整中」バッジで出る。
- 確定あり → 従来どおり確定が優先で出る。
- 確定・調整中とも今日以降に無い → カード非表示（現行と同じ）。
- 単体テスト: confirmed 優先 / collecting フォールバック / 両方無しで null。

---

## 2. イベント一覧のフィルターに境界をつける

### 現状

`components/event/event-list-controls.tsx` が返す `<section>` の中で、
検索フォーム（条件付き表示）・状態チップの帯・`<details>`（カテゴリ/表示順/件数）が
地の背景に直接並んでいて、どこまでが絞り込み操作か切れ目が無い。

### 変更（比較シートの「案イ」）

1. **外側をカードで囲う**: 検索＋状態チップ＋「検索・並び替え」の畳みを、
   `surface` 面・`line` の枠・`radius-card`・内側 padding で1ブロックにする。
   小見出し「絞り込み」を付ける。
2. **状態チップは表に残す**（畳まない）。切替が最も多く、2タップにすると現状より不便。
3. 検索フォームと `<details>` の中身（カテゴリ/表示順/件数）を、
   状態チップの下の **「検索・並び替え ▾」** の1行に畳む。
   - 閉じている時のサマリー: 「検索・並び替え　すべて · 新着順」（現在値を要約）。
   - 検索中・既定以外の条件が入っている時は開いた状態で表示（現行の `isDefaultDetail` / 検索中の扱いを踏襲）。
4. ページ送り・件数表示はカードの外（従来位置）のまま。

> 実装メモ: 効き目の大半は 1（カードで囲う）。3 の検索畳みは、
> 現行コードを見て過剰になるようなら省いてよい（検索フォームは既に `isSearchVisible` 条件付き）。
> その判断は実装フェーズで行い、判断結果をコミットメッセージに残す。

### 対象ファイル

- `components/event/event-list-controls.tsx`
- 既存のコメント（375px の縦幅制約に関する詳細な注記）は前提が変わらないので極力残す。

### 受け入れ条件

- 375px で、絞り込みブロックがカードとして下のイベントカードと視覚的に分離している。
- 状態チップは1タップで切り替わる。
- 検索・カテゴリ・表示順・件数の現在値が、閉じていてもサマリーで分かる。
- 検索中は結果 0 件でも検索欄（または解除導線）が残る（現行の担保を壊さない）。

---

## 3. カレンダーに「今日」ボタン

### 現状

`components/plan/adjustment-calendar-view.tsx` の月ヘッダーは `‹ [月ピッカー] ›` だけ。
数ヶ月先を見たあと今日に戻るには月送りを繰り返すしかない。

### 変更

- 月ヘッダーの右端に「今日」ピル（`btn-ghost` 相当、`line-strong` 枠・`pine` 文字）を足す。
- リンク先: `/plans?month=<当月>&date=<今日>`（JST。`toJstDateKey` / `defaultDateForMonth` を使う）。
- **表示中の月が実際の当月なら出さない**（押しても変化しないボタンを置かない）。
  判定は `currentMonth === <JST 当月の "YYYY-MM">`。

### 対象ファイル

- `components/plan/adjustment-calendar-view.tsx`
- 当月判定のヘルパーが無ければ `lib/domain/calendar/calendar-month.ts` か `lib/shared/jst.ts` に小関数を追加。

### 受け入れ条件

- 別の月を表示中 → 「今日」ボタンが見え、押すと当月・今日選択で開く。
- 当月を表示中 → ボタンは無い。
- SSR 環境（Vercel/UTC）でも「今日」が JST で正しい。

---

## 4. カレンダーの直近予定バー — 見送り

カレンダー画面には出さない。ホームの「次の予定」（#1）で代替する。
`AdjustmentCalendarView` の初期選択日は従来どおり「今日（当月なら）／月初」。

---

## 5. カレンダーの選択日を分かりやすく（案A・塗りつぶし）

### 現状

`lib/shared/calendar-styles.ts` の `dayCellClass`:
選択日 = `border-pine bg-moss/18`。薄く、初期表示の「今日＝選択中」が
まわりの土日祝の面色に埋もれて分かりにくい。

### 変更

- **選択日**: `bg-gradient-to-br from-pine to-pine-deep text-white border-pine-deep`（週ビュー `HomeSelectedDateAgenda` の選択表現と統一）。
  セル内のドットは白基調にする（`honey` ドットは白 or 明るいトーン）。
- **今日（選択中でない時）**: `border-2 border-pine` ＋ セル上端に小さな「今日」ラベル。
  選択日と今日が別の日なら、塗り（選択）と枠＋ラベル（今日）が両方見える。
- `CalendarDay` に `isToday: boolean` を追加する。
  `buildAdjustmentCalendar` に `now: Date`（または `todayDateKey: string`）を渡し、
  `toJstDateKey` 基準で判定する。呼び出し元 `AdjustmentCalendarView` から渡す。

### 対象ファイル

- `lib/shared/calendar-styles.ts`（`dayCellClass`）
- `lib/domain/plan/adjustment-calendar.ts`（`CalendarDay` に `isToday`、`buildAdjustmentCalendar` の引数）
- `components/plan/adjustment-calendar-view.tsx`（`now` を渡す、今日ラベルの描画）
- `tests/**/adjustment-calendar*.test.ts`

### 受け入れ条件

- 初期表示（今日＝選択中）で、そのセルが濃い塗りでひと目で分かる。
- 別の日を選ぶと、選択セル（塗り）と今日セル（枠＋ラベル）が同時に見える。
- `isToday` の単体テスト（当月内 / 当月外 / JST 境界）。

---

## 6. カレンダーの土日祝の背景色を全廃（案A）

### 現状

`dayCellClass`:
- 日曜・祝日 → `bg-clay/8 text-clay-ink`
- 土曜 → `bg-skywash/55 text-sky-800`

「土曜だけ背景が違う」＝日本のカレンダー慣習（土=青・日/祝=赤）を面で表現したもの。
ただし面を敷くほどの情報ではなく、選択日・今日・予定ありのセルと色がぶつかる。

### 変更

- 土曜・日曜・祝日の **背景（`bg-*`）を廃止**。通常セルと同じ `bg-surface`。
- 文字色は残す: 日曜・祝日 = `text-clay-ink`、土曜 = `text-sky-800`（または `sky-700`）。
  `weekdayClass`（曜日ヘッダー）は現状のままでよい（既に文字色のみ）。
- `hover` の枠色も土日祝で分けず、通常セルと同じ `hover:border-moss/45` に統一。
- 面（背景）を使うのは以下だけにする:
  - 選択日（#5: pine 塗り）
  - 今日（#5: 枠）
  - 当月外セル（`bg-surface text-muted` のまま）
- 祝日判定（`isJapaneseHoliday`）はそのまま。祝日は「赤文字」で示す。

### 対象ファイル

- `lib/shared/calendar-styles.ts`（`dayCellClass`）
- `tests/**/calendar-styles*.test.ts`（あれば）

### 受け入れ条件

- 月グリッドで、面が付いているのは選択日・今日・当月外のみ。
- 日曜/祝日は赤文字、土曜は青文字で区別が付く。
- 予定ありセルの緑ドットが、どの曜日でも同じ視認性。

---

## 7. 月ピッカーを Madoi 流に（12ヶ月グリッド＋年ホイール）

### 現状

`components/plan/adjustment-month-picker.tsx`:
`<details>` の中に `<input type="month">` が生で置かれ、OS 標準のピッカーが開く。
「この月を見る」ボタンで `router.push`。

### 変更

`<input type="month">` を撤去し、`<details>` パネルの中身を作り替える。

- **年**: 縦スクロールのホイール（iOS のピッカー風）。
  - 実装: `scroll-snap-type: y mandatory` の縦スクロールコンテナ。各年は**実ボタン**（`<button>`）で、
    フォーカス・Enter で選択でき、スクロールでも中央スナップで選択が変わる。
  - 中央に選択中を示す上下ボーダーの帯、上下にフェード。
  - 年の範囲は「当年 −3 〜 +3」程度（イベントは基本1年先まで）。要件が出たら広げる。
  - `prefers-reduced-motion` 時はスムーススクロールを切る。
- **月**: 4×3 の 12ヶ月グリッド（`1月`〜`12月`）。現在の月を pine 塗りでハイライト。
- 月をタップした時点で `router.push(`/plans?month=${y}-${mm}&date=${y}-${mm}-01`, { scroll: false })` して
  `<details>` を閉じる（確定ボタン不要）。年だけ変えて月未選択のままパネルを閉じた場合は遷移しない。
- 前後の `‹ ›` 月送り（`AdjustmentCalendarView` 側）は残す。
- `<summary>` のラベルは `2026年9月 ▾`（`monthLabel` を流用）。

### アクセシビリティ

- 年ホイール: `role` は素直に `<button>` の集合。スクリーンリーダーでは各年ボタンを読み上げ、
  現在値は `aria-current="true"` or `aria-pressed`。キーボードだけでも操作可能（Tab で年、Enter で選択）。
- `<details>`/`<summary>` のネイティブ開閉を維持。
- フォーカスリング（`focus:ring-2 focus:ring-clay`）を全ボタンに。

### 対象ファイル

- `components/plan/adjustment-month-picker.tsx`（大部分を書き換え）
- 年リスト生成のヘルパーを `lib/domain/calendar/calendar-month.ts` に置いてもよい（テスト用）。
- `tests/**`（月選択で正しい URL に push されること。ロジック部分を関数に切り出して単体テスト）

### 受け入れ条件

- OS 標準の month input が出ない。
- 年ホイールをスクロール／年ボタンをキー操作 → 12ヶ月グリッドが対象年に切り替わる。
- 月をタップ → 対象年月・月初選択でカレンダーが開き、パネルが閉じる。
- `prefers-reduced-motion: reduce` でアニメーションが無効。
- 375px でパネルが画面幅に収まる。

---

## テスト方針

- ドメイン関数（`findNextUpcomingItem`、`isToday` 判定、年リスト生成、月選択 URL 生成）は Vitest で単体テスト。RED を先に確認。
- 見た目の変更（#2,#5,#6,#7）は実ブラウザ（`npm run dev`）で 375px と デスクトップ幅を目視確認してから完了とする。
- 既存テストを壊さない。壊れたら原因を直す（スキップ・削除しない）。

## Batch B（別途）

- 通知をヘッダーのベルから下部ナビへ（下部ナビの項目数・375px の窮屈さを比較）。
- モバイルのナビを左ドロワー化（アイコン＋ラベルの横並びを縦積み）。
- どちらも Artifact でモック比較してから設計に落とす。
