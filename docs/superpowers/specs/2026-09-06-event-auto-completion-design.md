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
- プロンプト通知の繰り返し（1スヌーズ期間に1回、カードの帯が継続表示を担う）

## タイムライン

```
イベントの最終開催日
      │
      │  30日（何も出さない。まだ清算するかもしれないし、
      │        明らかに終わっていて放置でも問題ない期間）
      ▼
promptDue 到達（= 最終開催日+30日、スヌーズ中はその明け）
   ＋ status が planning/confirmed
   ＋ lifecycle 済み（開催日を過ぎた）
   ＋ 清算待ちでない
      │
      ▼
・一覧カードに確認帯（案B）
・ベル通知1件（案A、kind = wrapup_prompt）
      │
      │  さらに14日、オーナーの操作なし
      ▼
autoDoneDue 到達
・EVENT_WRAPUP_AUTO_DONE=on なら cron が status='done'、wrapup_auto_done=true
  ＋ ベル通知1件（kind = wrapup_done、「戻す」付き）
・off（dry-run）なら status 不変、ログのみ
```

- 最初の猶予: **30日**
- プロンプト → 自動 done の猶予: **14日**
- オーナーの操作: 「完了にする」（即 done）／「後で」（30日スヌーズ、無制限）

## データモデル

### migration 049

**`events` に2列追加:**

| 列 | 型 | 用途 |
|---|---|---|
| `wrapup_snoozed_until` | `timestamptz` null可 | 「後で」「戻す」だけが書く。この時刻まではプロンプトも自動 done も出さない。バックフィルで「もう気にしない」古いイベントを遠い未来（`'2999-01-01'`）にして恒久除外するのにも使う |
| `wrapup_auto_done` | `boolean not null default false` | cron が自動 done したか。`wrapup_done` 通知を出すか・きれいに復元できるかの判断に使う |

**`wrapup_prompt_at` は持たない。** プロンプト／自動 done の起点は cron が毎回 plans と日付から計算する（下記「タイマーの計算」）。開催日が後から変わってもズレない。

**インデックス:** `create index events_wrapup_scan_idx on public.events (status) where status in ('planning', 'confirmed');`（cron の走査候補を絞る）。

**ロールバック:** 2列と index を drop するだけ。データ破壊なし。

**notifications の kind 追加（同 migration）:** `notifications_kind_check` に `wrapup_prompt`, `wrapup_done` を追加（既存の制約を drop して張り直す。migration 013 と同じパターン）。

**バックフィル（同 migration の DML）:** 既存の対象イベント（`isEventWrapupEligible` 相当を SQL で近似 — `status in ('planning','confirmed')` かつ最終開催日が過去）のうち、**最終開催日がリリース時点で90日超前**のものに `wrapup_snoozed_until = '2999-01-01'` をセット。「もう気にしていない」古いイベントを一切触らないため。それ以外の既存イベントは列 null のまま通常フローに乗る（下記のタイマー計算に `now() + 14日` の下限があるので一斉発火しない）。

### 「最終開催日」の定義

`isEventLifecycleFinished` と同じ計算。確定プラン（`ignoredPlanStatuses` を除く）があればその最遅の終了時刻（`confirmed_end_at ?? confirmed_start_at` を `endOfScheduleTimestamp` に通す）。なければ `event.end_date ?? event.start_date` の当日終わり（JST）。

### タイマーの計算（保存しない。毎回導出）

```
lastDate     = 最終開催日（上記）
promptDue    = max(lastDate + 30日, wrapup_snoozed_until ?? -∞, リリース日 + 14日)
autoDoneDue  = promptDue + 14日
```

- `リリース日 + 14日` の下限は、バックフィル対象（列 null で90日以内）がリリース直後に発火しないための保険。実装ではリリース日を定数で持つ（例 `WRAPUP_ROLLOUT_FLOOR = '2026-09-XX'`）。リリースから2週間経てば実質無効になる。
- プロンプトを出す条件: `now >= promptDue`
- 自動 done の条件: `now >= autoDoneDue` かつ `EVENT_WRAPUP_AUTO_DONE === 'on'`

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

1. **対象取得** — `events` を `status in ('planning', 'confirmed')` で、plans を join して取得。owner ごと。件数は closed beta 規模なので全件で可（既存 cron と同じキーセットページング方針）。TS 側で `isEventWrapupEligible` を通し、`wrapup_snoozed_until` が未来ならスキップ。
2. **タイマー計算** — 対象ごとに `promptDue` / `autoDoneDue` を導出（保存しない）。
3. **プロンプト通知** — `now >= promptDue` の対象に kind `wrapup_prompt` の通知を upsert。`dedupe_key = 'event_wrapup:' + event.id + ':' + promptDue.toISOString().slice(0,10)`（スヌーズで `promptDue` が動くと新しい dedupe_key になり、スヌーズ明けに再通知される）。href はイベント詳細。dry-run 中と本番で本文を出し分け（下記「通知の文面」）。
4. **自動 done** — `EVENT_WRAPUP_AUTO_DONE === 'on'` かつ `now >= autoDoneDue` の対象に:
   - `events` を `status = 'done'`, `wrapup_auto_done = true` に更新
   - kind `wrapup_done` の通知を作成（`dedupe_key = 'event_wrapup_done:' + event.id`）。「◯◯を完了にしました。1ヶ月以上動きがなかったためです。」＋「戻す」
   - この event の未読 `wrapup_prompt` 通知を既読化（`settlements.ts` と同じ後始末パターン）
   - **dry-run 中（`EVENT_WRAPUP_AUTO_DONE !== 'on'`）** は status を変えず、`console.log('[wrapup] would auto-complete', { eventId, lastDate, autoDoneDue })` だけ出す。

### 冪等性

- 手順3は `dedupe_key`（promptDue の日付入り）の upsert で、同じスヌーズ期間内は1回だけ
- 手順4は `status = 'done'` になった時点で次スキャンの手順1（status フィルタ）で除外される。dry-run 中はログが毎回出るが実害なし

### エラー処理

1件の更新失敗で全体を止めない。集計して結果を返す（既存 cron は1エラーで 500 を返す作りだが、mutation が混ざるので変更する）。レスポンス: `{ notified, autoCompleted, wouldAutoComplete, eventsScanned, plansScanned, errors: [...] }`。

### 通知の文面

- **dry-run 中**: 「◯◯は終わりましたか？」＋ href。自動完了には触れない
- **本番（auto-done on）**: 上に加えて「このまま何もしないと {autoDoneDue の日付} に自動で完了になります」の一文

### dry-run から本番への切替（運用チェックリスト）

1. 約1ヶ月、`wouldAutoComplete` のログ／レスポンスを確認
2. ログに「完了にすべきでないイベント」が出ていないこと（＝ `isEventWrapupEligible` が正しい）を確認
3. 問題なければ Vercel の環境変数 `EVENT_WRAPUP_AUTO_DONE` を `on` に。コード変更・再デプロイ不要（環境変数変更で次回 cron から有効）

## UI

### 案B — 一覧カードの確認帯（主）

`app/events/page.tsx`:

- `getEventCardSummary` に `wrapupPrompt: boolean` を追加（`isEventWrapupEligible(event, now)` かつ `now >= promptDue`。`promptDue` は cron と同じ計算式を共通関数 `getEventWrapupTimers(event, now)` に切り出して両方から使う）
- クエリで `wrapup_snoozed_until` を取得する（`app/events/page.tsx` の events select に追加。RPC は id しか返さないので events の再フェッチ側）
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
| `completeEventAction(eventId)` | owner 確認 → `status = 'done'`, `wrapup_auto_done = false`。この event の未読 `wrapup_prompt` 通知を既読化 |
| `snoozeEventWrapupAction(eventId)` | owner 確認 → `wrapup_snoozed_until = now() + interval '30 days'`。未読 `wrapup_prompt` 通知を既読化 |
| `reopenEventAction(eventId)` | owner 確認 → `status = 'planning'`, `wrapup_auto_done = false`, `wrapup_snoozed_until = now() + interval '30 days'`（すぐ再発火させない）|

全アクション `revalidatePath("/")`, `revalidatePath("/events")`。owner ガードは既存の `cancelEventAction` と同じ `.eq("owner_user_id", user.id)`。0 行マッチでも throw しない既存挙動に合わせるが、`completeEventAction` は「押した本人＝ owner」が前提なので実害なし。

`reopenEventAction` が `planning` 固定なのは:
- `done` のまま何か列を戻しても `isEventLifecycleFinished` が `status='done'` で永久に短絡する（`event-filter.ts:264`）ので、非終了に戻すことが必須
- 既存の `restartPlanAdjustmentAction`（`lib/actions/plan/plans.ts`）も terminal からの復帰で `events.status='planning'` にしており、パターンが揃う
- 確定プランが残っていれば派生状態が再計算され、未来なら「開催待ち」、過去のままなら再び「完了」→ スヌーズ明けに再プロンプト（穏やかなリマインドとして許容）

既存の「再調整を始める」ボタン（`app/plans/[planId]/page.tsx:304`、`plan.status==='date_confirmed'` のみが条件で `event.status` を見ない）は**触らない**。自動 done 後に押しても `restartPlanAdjustmentAction` が `events.status='planning'` にするので、実質的な reopen 経路として自然に機能する。

## エッジケース

| 状況 | 挙動 |
|---|---|
| プロンプト後に新しい未来の日程が確定 | `isEventLifecycleFinished` が false → `isEventWrapupEligible` false → 帯・通知が消える。自動 done されない |
| オーナーが cron より先に手で完了 | `status = 'done'` で以降スキップ |
| プロンプト後に立替追加で清算が必要に | 派生状態が `settlement_waiting` → `isEventWrapupEligible` false → 帯は隠れ wrapup は止まる。清算完了後にまた対象へ |
| 自動 done 済みを「戻す」 | `status='planning'` に復帰、`wrapup_snoozed_until = now()+30日`、`wrapup_auto_done=false` |
| 自動 done 後に未来の確定プランを足す | `status='done'` の短絡で派生状態は `completed` のまま（`event-filter.ts:264`）。先に「戻す」を押させる必要がある。`wrapup_done` 通知の「戻す」がその導線 |
| タイムゾーン | 最終開催日の判定は既存の JST 対応 `endOfScheduleTimestamp` をそのまま使う（Vercel は UTC） |
| 中止済みイベント | `status` チェックで最初から除外 |
| 「後で」を無限に繰り返す | オーナーの選択として許容（30日ごとに再プロンプト、`dedupe_key` が変わるので通知も再度出る） |
| `done` イベントのチャット・タスク | 既存挙動どおり動く（`cancelled` だけが止める）。この設計では変更しない |

## テスト

- **純粋関数** `isEventWrapupEligible(event, now)` / `getEventWrapupTimers(event, now)`（`tests/event/`）— lifecycle 済み × 清算不要のみ eligible。清算待ち・done・cancelled・未来予定ありは false。timers はスヌーズ・リリース下限・最終開催日の各条件で `promptDue` / `autoDoneDue` が正しい
- **cron ロジック**（`tests/db/`）— 30日後にプロンプト通知1件 → 44日後、`EVENT_WRAPUP_AUTO_DONE='on'` で `status='done'` ＋ `wrapup_done` 通知、`off` では status 不変でログのみ。スヌーズ後は dedupe_key が変わって再通知。2回流して重複なし
- **Server actions**（`tests/actions/`）— 各アクションの status / 列遷移と owner ガード、非 owner 拒否
- **EventCard**（`tests/event/events-page.test.tsx`）— 帯の表示条件（`wrapupPrompt` true/false）とボタンの action 紐付け（jsdom はクラス名検証）
- **スキーマ文字列テスト**（`tests/event/schema/`）— migration 049 の列追加・kind 制約・バックフィル DML

## 実装順（プラン作成時の目安）

1. migration 049（`wrapup_snoozed_until` / `wrapup_auto_done` / index / kind 制約 / 90日超バックフィル DML）＋ スキーマ文字列テスト
2. `isEventWrapupEligible` ＋ `getEventWrapupTimers` 純粋関数 ＋ テスト（TDD、RED 確認）
3. Server actions 3本（`completeEventAction` / `snoozeEventWrapupAction` / `reopenEventAction`）＋ テスト
4. cron に events 走査を追加（環境変数ガード込み）＋ DB テスト
5. `getEventCardSummary` に `wrapupPrompt` ＋ `app/events/page.tsx` のクエリと帯 ＋ コンポーネントテスト
6. 通知 kind 2種（`wrapup_prompt` / `wrapup_done`）の UI 対応・文面の dry-run 出し分け
7. リリース後: dry-run ログを1ヶ月監視 → 問題なければ `EVENT_WRAPUP_AUTO_DONE=on`

## 未確定（実装計画で潰す。設計判断ではない）

- `wrapup_prompt` 通知にアクションボタンを持たせる仕組みが既存にあるか（`confirmation_due` の実装を読む）。無ければ href 遷移＋帯で操作にフォールバック
- `NotificationActionFilter` への新 kind の割り当て（当面「すべて」のみで可）
- `WRAPUP_ROLLOUT_FLOOR` 定数の具体日（マージ日を見て決める）
