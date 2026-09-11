# イベント一覧のグループ表示化（案A）

- 日付: 2026-09-11
- ステータス: 設計確定（grill-me済み。実装計画待ち）
- 関連: `design/proposals/2026-09-07-event-list-rethink.html`（3案比較モック、案Aを採用）

## 背景

現状の `/events` 一覧は、カードに進行状態バッジ・カテゴリバッジ・日時・場所・参加人数が並び、絞り込みは状態タブ4つ＋進行状態チップ5つ＋検索/カテゴリ/表示順/表示件数の折りたたみ、という情報量。ユーザー評価は「見やすくない」「一覧を見た瞬間に自分が何をすべきか分からない」。

## ゴール

一覧を「やること」でグルーピングし、対応が要るイベントが自然に目に入るようにする。カードは1行に圧縮し、状態バッジ・進行状態チップが担っていた情報はグループ構造とカードの1行に吸収する。

## スコープ

**含む**: `/events` 一覧のグルーピング・カード内容・コントロール（`app/events/page.tsx`, `components/event/event-list-controls.tsx`, `lib/domain/event/event-filter.ts`, `lib/shared/format.ts`）

**含まない**: `/events/[eventId]` 詳細ページ、通知、wrapup帯（`EventWrapupActions`）・中止アクション（`EventCancelAction`）の中身（既存のまま流用）、DB migration（後述の通り今回は不要にする設計）

## グループ分け

`getEventDisplayState`（既存の7派生状態）を起点に、新しい純粋関数 `getEventListGroup(event, now): "your_turn" | "waiting" | "upcoming" | "done"` を追加する。

| 派生状態 | グループ | 例外 |
|---|---|---|
| `schedule_creation_waiting` | あなたの番 | — |
| `participant_waiting` | あなたの番 | — |
| `settlement_waiting` | あなたの番 | — |
| `answer_waiting` | `deadlineState === "closed"` ならあなたの番、それ以外は待ち | plan の `deadlineState`（`lib/domain/plan/plans.ts`）で判定 |
| `event_waiting` | これから | — |
| `completed` | おわり | `shouldShowWrapupPrompt(event)` が true なら**あなたの番へ強制分類**（下記エッジケース） |
| `cancelled` | おわり | — |

グループ内の並び順は、追加のソートを入れない。**ページ全体の並び順（`sort=soonest/newest/latest`）をそのまま保って、その順序でバケツに振り分けるだけ**。ページを跨いだ並び替えはしない（後述「データ取得」参照、既に合意済みの設計）。

## カード

1行の本文（タイトル下）をグループごとに出し分ける。

| グループ | 表示 | 元データ |
|---|---|---|
| あなたの番 | アイコン＋アクション文言 | 下表 |
| 待ち | `回答受付中`（固定文言） | — |
| これから | 相対日付＋時刻（`明日 19:00` / `土 19:00` / `9/20(土) 19:00`） | `getEventSchedule().startAt` |
| おわり | 開催日のみ、または `中止` | 同上 |

**「待ち」の回答カウント（`回答 2/4人`）は出さない（grill-meで確定）。** 正確な人数を出すには一覧クエリに候補日＋回答のJOINを新たに足す必要があり（現状の一覧取得には候補・回答データが一切無い）、コストに見合わないため固定文言にする。

あなたの番のアクション文言（`getEventDisplayState` → 固定文言）:

| 派生状態 | 文言 |
|---|---|
| `schedule_creation_waiting` | `＋ 日程の候補をつくる` |
| `participant_waiting` | `▶ 日程調整を始める` |
| `answer_waiting`（締切済み） | `✎ 回答を締めて日程を確定する` |
| `settlement_waiting` | `¥ 清算をまとめる` |
| wrapup対象（下記） | `✓ 完了か確認する` |

カードの残りの要素（カテゴリドット、チェブロン）は3案比較モック通り。既存の場所・参加人数はカードから外し、タップ後の詳細ページに任せる。

## 相対日付ヘルパー

`lib/shared/format.ts` に `formatRelativeEventDate(value, now)` を追加。

- 今日: `今日 19:00`
- 明日: `明日 19:00`
- 2〜6日先: 曜日＋時刻（`土 19:00`）
- 7日以上先、または年をまたぐ: `9/20(土) 19:00` / `2027/1/3(日) 19:00`

JST基準は既存の `jstFormat` / `jstDateKey` をそのまま使う。

## コントロール

`EventListControls` は表示モードで2系統に分岐する（grill-meで確定）。

- **グループ表示（既定 = `status=active` を明示しない通常アクセス）**: 検索（テキスト）＋カテゴリ（チップ）のみ。進行状態チップ（`EVENT_LIST_PROGRESS_STATES` のUI）・状態タブ（進行中/下書き/完了/中止）は撤去
- **深掘り表示（`status=completed`/`cancelled`/`draft` を明示指定してアクセス。後述「おわり」の「もっと見る」経由が主な入口）**: 既存の完全なタブUI（状態タブ含む、進行状態チップは元々 `status==="active"` の時しか出ていなかったので実質変化なし）をそのまま残す。実装スコープをグループ化に限定するための割り切り
- 表示順・表示件数セレクトは（両モードとも）「検索・並び替え」の折りたたみに残す。デフォルト表示件数は10件のまま変更しない
- 下書きは状態タブが無くなるので、**フィルタ条件に関係なく、存在すれば常に一覧の先頭にカードとして表示**（grill-meで確定。既存の `visibleDraft` 判定にあった「`query.status === "draft"` かつカテゴリ/検索一致」の条件は外す）

## データ取得とグルーピング

現状の `list_owned_event_ids` RPC・`app/events/page.tsx` のフェッチ構造は変更しない。

- メインクエリ: 今までの `status=active`（`interested/planning/confirmed`）を**固定で**呼ぶ。ソート・検索・ページングは既存のまま。取得したページを「あなたの番／待ち／これから」の3グループに再分配する（ページ跨ぎの並び替えはしない）。
- 「おわり」（`completed`/`cancelled`を合算）は**別枠の小さいクエリ**で最大5件、最終開催日が新しい順に取得。ページングしない・折りたたみ表示。現在の検索語・カテゴリ絞り込みは**この小クエリにも適用する**（grill-meで確定。メインクエリと同じ条件で1つ絞り込み条件だけ足す形。ヒットが5件を超える場合の取りこぼしは許容し、「もっと見る」で深掘り表示へ誘導すれば足りる）
- 「もっと見る」は `/events?status=completed`（既存の完了タブのURLをそのまま活かす。深掘り表示として既存の完全なタブUIごと温存するので、そこから中止タブへの遷移もそのまま可能）
- **この分離により、RPC・DB migrationの変更なしで案Aを実現する。** 「全ステータスを1クエリでグルーピングして返す」設計も検討したが、`list_owned_event_ids` の `p_filter` に新しい分岐を足す migration が要り、スコープ・リスクに見合わない。

## エッジケース

| 状況 | 挙動 |
|---|---|
| wrapup対象（開催済み・清算不要・DBはまだ `done` でない） | `getEventDisplayState` は `completed` だが `shouldShowWrapupPrompt(event)` が true の間は**あなたの番へ強制分類**。カード下の確認帯（`EventWrapupActions`）は現状通り表示 |
| 中止アクション（`EventCancelAction`） | 現状通りカード下部に表示（今回のカード1行の対象外、既存の帯として温存） |
| グループが0件 | 見出しごと非表示 |
| 下書きあり | フィルタに関係なく先頭に常時表示 |
| 検索中・カテゴリ絞り込み中 | 「おわり」の小クエリにも同じ条件を適用（隠さない） |

## テスト

- `getEventListGroup`（`tests/event/`）— 7派生状態＋wrapup例外の分類。`answer_waiting` の締切前後
- `formatRelativeEventDate`（`tests/shared/` または既存 `format.test.ts`）— 今日/明日/週内/週外/年またぎ
- `app/events/page.tsx` 相当のグルーピング・下書き常時表示・おわり別枠クエリ（検索・カテゴリ条件の反映込み）（`tests/event/events-page.test.tsx`）
- `event-list-controls.tsx` — グループ表示モード（進行状態チップ・状態タブが無いこと）と深掘りモード（`status=completed`等で既存タブUIが出ること）の両方

## 実装順

1. `getEventListGroup` 純粋関数＋テスト（TDD、RED確認）
2. `formatRelativeEventDate`＋テスト
3. `app/events/page.tsx` 書き換え（グルーピング・おわり別枠クエリ・下書き常時表示・カード1行UI）
4. `event-list-controls.tsx` にモード分岐を追加（グループ表示 = 簡素UI／深掘り = 既存の完全UI）
5. `tests/event/events-page.test.tsx` 更新・実行

## 未確定（実装計画で潰す。設計判断ではない）

- あなたの番の件数を他画面（ホーム等）に出すかは今回スコープ外。構造的には `getEventListGroup` を再利用できる
