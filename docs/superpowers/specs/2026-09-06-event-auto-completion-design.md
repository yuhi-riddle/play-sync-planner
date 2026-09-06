# 期日超過・清算不要イベントの自動完了

- 日付: 2026-09-06
- ステータス: 設計確定（実装計画待ち）
- 関連: `design/proposals/2026-09-06-event-completion-prompt.html`（押させ方の3案比較）

## 背景と問題

`events.status = 'done'`（ラベル「完了」）を立てるコードは現状のアプリに1行もない。`done` は enum と `eventStatusLabels` に存在するだけで、アプリからは到達不能。清算が完了しても `events.status` には波及しない。

その結果、**開催日を過ぎて清算も不要なイベントが、`status = 'confirmed'`（または `planning`）のまま放置される**。

一覧の「進行中／完了」タブ自体は困っていない。`getEventDisplayState`（`lib/domain/event/event-filter.ts`）が `isEventLifecycleFinished && isEventSettlementFinished` を `completed` と判定し、`matchesEventListFilter` は派生状態で振り分けるので、期日超過＋清算片付き済みのイベントは既に「進行中」から外れて「完了」タブに入っている。`events.status` は見ていない。

困っているのは:

1. **オーナーが「あのイベントどうなったっけ」に気づく機会がない** — 通知が来ない。既存 cron（`app/api/cron/notifications`）は `plans` の `collecting_answers` / `date_confirmed` しか走査しない。
2. **`events.status` が実態とズレたまま** — 表示は「完了」でも DB は `confirmed`。

## ゴール

開催日を過ぎたまま清算不要で開きっぱなしのイベントを、オーナーに確認させて閉じる。放置されれば猶予後に自動で `done` にする。オーナーは自動完了を1操作で戻せる。

## スコープ

**含む**: 開催日を過ぎたイベント（確定プランが終了、または `event.end_date` / `start_date` 経過）で、清算待ちでないもの。

**含まない**:

- 日程もプランも無く「気になる／調整中」で放置されたイベント（別テーマ「放置イベントの棚卸し」）
- 清算完了時に `events.status = 'done'` を立てる（settlement 側の変更。別スペック）
- 参加者への通知（オーナーのみ）
- プロンプト通知の繰り返し（通知は1回、カードの帯が継続表示を担う）

## タイムライン

```
イベントの最終開催日
      │
      │  30日（何も出さない。まだ清算するかもしれないし、
      │        明らかに終わっていて放置でも問題ない期間）
      ▼
wrapup_prompt_at 到達
   ＋ status が done/cancelled でない
   ＋ 清算待ちでない
      │
      ▼
・一覧カードに確認帯（案B）
・ベル通知1件（案A、kind = wrapup_prompt）
      │
      │  さらに14日、オーナーの操作なし
      ▼
cron が status = 'done'、wrapup_auto_done = true
・ベル通知1件（kind = wrapup_done、「戻す」付き）
```

- 最初の猶予: **30日**
- プロンプト → 自動 done の猶予: **14日**

## データモデル

### migration 049（`events` に2列追加）

| 列 | 型 | 用途 |
|---|---|---|
| `wrapup_prompt_at` | `timestamptz` null可 | 確認プロンプト／自動 done の起点。cron が「最終開催日 + 30日」を最初にセット。「後で」で `now() + 30日` に更新 |
| `wrapup_auto_done` | `boolean not null default false` | cron が自動 done したか。`wrapup_done` 通知を出すか・きれいに復元できるかの判断に使う |

インデックス: `create index on public.events (wrapup_prompt_at) where wrapup_prompt_at is not null;`（cron の走査用）。

ロールバック: 2列と index を drop するだけ。データ破壊なし。

### notifications の kind 追加（同 migration）

`notifications_kind_check` に `wrapup_prompt`, `wrapup_done` を追加（既存の制約を drop して張り直す。migration 013 と同じパターン）。

### 「最終開催日」の定義

`isEventLifecycleFinished` と同じ計算。確定プラン（`ignoredPlanStatuses` を除く）があればその最遅の終了時刻（`confirmed_end_at ?? confirmed_start_at` を `endOfScheduleTimestamp` に通す）。なければ `event.end_date ?? event.start_date` の当日終わり（JST）。cron の起点セットと自動 done 判定は両方この値を使う。

### バックフィル

初回 cron 実行時、既存の対象イベントに:

```
wrapup_prompt_at = greatest(最終開催日 + interval '30 days', now() + interval '14 days')
```

リリース直後にプロンプト・自動 done が一斉発火しないよう、最低14日の猶予を挟む。

## 対象判定（純粋関数）

`isEventWrapupEligible(event: EventListItem, now: Date): boolean`（`lib/domain/event/event-filter.ts` に追加）

true の条件:

- `event.status` が `'planning'` または `'confirmed'`（`done` / `cancelled` / `skipped` は false）
- `isEventLifecycleFinished(event, now)` が true
- `getEventDisplayState(event, now)` が `'settlement_waiting'` を返さない（清算待ちは既存の清算リマインドの担当）

判定ロジックは SQL に二重化しない。cron は候補を広めに SQL で引き、TS 側でこの関数を通す。

## cron の処理

`app/api/cron/notifications/route.ts` に events 走査を追加。GAS トリガーは1本のまま（`docs/gas-notification-schedule.md`）。エンドポイントの役割が「予約通知」から「予約タスク」に広がる。

Vercel Cron は使わない（`docs/current-status.md`: vercel.json に crons を足すと GAS と二重実行になる）。

### 処理順

1. **対象取得** — `events` を `status in ('planning', 'confirmed')` で、plans を join して取得。owner ごと。件数は closed beta 規模なので全件で可（既存 cron と同じキーセットページング方針）。TS 側で `isEventWrapupEligible` を通す。
2. **起点セット** — `wrapup_prompt_at is null` の対象に `最終開催日 + 30日`（バックフィル分は下限 `now() + 14日`）を書く。
3. **プロンプト通知** — `now >= wrapup_prompt_at` かつ未通知の対象に kind `wrapup_prompt` の通知を upsert。`dedupe_key = 'event_wrapup:' + event.id`。href はイベント詳細。
4. **自動 done** — `now >= wrapup_prompt_at + interval '14 days'` の対象に:
   - `events` を `status = 'done'`, `wrapup_auto_done = true` に更新
   - kind `wrapup_done` の通知を作成（「◯◯を完了にしました。30日以上動きがなかったためです。」＋「戻す」）
   - 既存の `wrapup_prompt` 通知を既読化（`settlements.ts` と同じ後始末パターン）

### 冪等性

- 手順2は null 条件で二重書き込みなし
- 手順3は `dedupe_key` の upsert で1回だけ
- 手順4は `status = 'done'` になった時点で次スキャンの手順1で除外される

### エラー処理

1件の更新失敗で全体を止めない。集計して部分成功を返す（既存 cron は1エラーで 500 を返す作りだが、mutation が混ざるので変更する）。レスポンスに `{ promoted, autoCompleted, plansScanned, eventsScanned, errors: [...] }`。

## UI

### 案B — 一覧カードの確認帯（主）

`app/events/page.tsx`:

- `getEventCardSummary` に `wrapupPrompt: boolean` を追加（`isEventWrapupEligible(event, now)` かつ `event.wrapup_prompt_at != null` かつ `now >= wrapup_prompt_at`）
- RPC / クエリで `wrapup_prompt_at` を取得する（`app/events/page.tsx` の select に追加）
- true のとき `EventCard` 下部に帯:
  - 面: `bg-sunken`、上辺 `border-t border-dashed border-line-strong`
  - 文言: 「開催おつかれさまでした。このイベント、締めていい？」
  - ボタン: **完了にする**（主 CTA、pine グラデ）／ **後で**（ゴースト）
- モックは `design/proposals/2026-09-06-event-completion-prompt.html` の案B

### 案A — ベル通知（補助）

既存の通知 UI:

- `NotificationKind`（`lib/domain/shared/site-notifications.ts`）に `wrapup_prompt`, `wrapup_done` を追加
- `wrapup_prompt`: 既存のアクション付き通知（`confirmation_due` など）の仕組みを踏襲する。もし通知カードにアクションボタンを持たせる仕組みが無ければ、href でイベント詳細へ飛ばして帯で操作させる方式にフォールバックする。どちらになるかは既存実装を読んで決める（設計としてはどちらでも成立する）
- `wrapup_done`: 「戻す」→ `reopenEventAction`
- `NotificationActionFilter`（`unread` / `deadline` / `unanswered` / `settlement` / `payment` / `confirmation`）に新 kind を割り当てるか。既存の分類に合うものが無いので、当面はどのアクションフィルタにも入れず「すべて」でのみ見える扱いにする

### Server Actions（`lib/actions/event/events.ts`）

| action | 処理 |
|---|---|
| `completeEventAction(eventId)` | owner 確認 → `status = 'done'`, `wrapup_auto_done = false`。`wrapup_prompt` 通知を既読化 |
| `snoozeEventWrapupAction(eventId)` | owner 確認 → `wrapup_prompt_at = now() + interval '30 days'`。`wrapup_prompt` 通知を既読化 |
| `reopenEventAction(eventId)` | owner 確認 → `status = 'confirmed'`, `wrapup_auto_done = false`, `wrapup_prompt_at = now() + interval '30 days'`（すぐ再発火させない）|

全アクション `revalidatePath("/")`, `revalidatePath("/events")`。非 owner は既存の `cancelEventAction` と同じ形で拒否。

`reopenEventAction` が `confirmed` 固定なのは、対象が「確定プランを持つ期日超過イベント」だから。プランなしの期日超過（`event.end_date` だけで判定されたケース）でも、開催日が設定済み＝日程は決まっていたので `confirmed` で妥当。

## エッジケース

| 状況 | 挙動 |
|---|---|
| プロンプト後に新しい未来の日程が確定 | `isEventLifecycleFinished` が false → 帯・通知が消える。自動 done されない。`wrapup_prompt_at` は残るが判定で弾かれる |
| オーナーが cron より先に手で完了 | `status = 'done'` で以降スキップ |
| プロンプト後に立替追加で清算が必要に | 派生状態が `settlement_waiting` → 帯は隠れ、wrapup は止まる。清算完了後にまた対象へ |
| 自動 done 済みを「戻す」 | `confirmed` に復帰、`wrapup_prompt_at` は +30日先 |
| タイムゾーン | 最終開催日の判定は既存の JST 対応 `endOfScheduleTimestamp` をそのまま使う（Vercel は UTC） |
| 中止済みイベント | `status` チェックで最初から除外 |
| 「後で」を無限に繰り返す | オーナーの選択として許容（30日ごとに再プロンプト） |

## テスト

- **純粋関数** `isEventWrapupEligible(event, now)`（`tests/event/`）— lifecycle 済み × 清算不要のみ true。清算待ち・done・cancelled・未来予定ありは false
- **cron ロジック**（`tests/db/`）— 起点セット → 30日後にプロンプト通知1件 → 44日後に `status = 'done'` ＋ `wrapup_done` 通知。2回流して重複なし（冪等）
- **Server actions**（`tests/actions/`）— 各アクションの status 遷移と owner ガード、非 owner 拒否
- **EventCard**（`tests/event/events-page.test.tsx`）— 帯の表示条件（`wrapupPrompt` true/false）とボタンの action 紐付け（jsdom はクラス名検証）

## 実装順（プラン作成時の目安）

1. migration 049（2列 + index + kind 制約）＋ スキーマ文字列テスト
2. `isEventWrapupEligible` 純粋関数 ＋ テスト（TDD、RED 確認）
3. Server actions 3本 ＋ テスト
4. cron に events 走査を追加 ＋ DB テスト
5. `getEventCardSummary` に `wrapupPrompt` ＋ `app/events/page.tsx` のクエリと帯 ＋ コンポーネントテスト
6. 通知 kind 2種の UI 対応
7. バックフィルの確認（初回 cron 実行を本番で監視）
