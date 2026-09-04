# イベント一覧を進行状態で絞り込む（FU #3）設計

作成日: 2026-09-04
発端: Batch A / PR-1 の目視確認フィードバック「回答待ちとかそのステータスでも絞れると嬉しい」

## 背景

イベント一覧の絞り込みチップは `進行中 / 下書き / 完了 / 中止` の4つ。
`参加者待ち / 日程作成待ち / 回答待ち / 開催待ち / 清算待ち` の細かい進行状態は、いま
カードのバッジ（`getEventDisplayState`）に出るだけで絞り込みには使えない。

一覧の絞り込み・並び替え・ページング・総件数は RPC `list_owned_event_ids`（migration 029）が
一括で担っているので、進行状態で絞るならその状態計算を RPC 側にも持たせる必要がある。

## 決定事項

| 項目 | 決定 |
|---|---|
| 対象状態 | `EventDisplayState` の全7値。既存の `完了 / 中止` に加え、5つの進行状態を絞り込みに追加 |
| UI | **2段チップ**。上段は現状のまま、`進行中` 選択時のみ下段に5つ＋「すべて」 |
| ロジックの二重化 | `getEventDisplayState`（TS）を SQL にミラー。`tests/db/` にパリティテストを置いて一致を検証 |
| マイグレーション | 本番DBに触るので、実装計画を提示してユーザー承認を得てから適用 |

## スコープ

- 対象: `list_owned_event_ids` RPC、`lib/domain/event/event-filter.ts`、`components/event/event-list-controls.tsx`、`app/events/page.tsx`
- 対象外: `list_calendar_items`（migration 034 未適用の件は別）、`getEventDisplayState` の TS 実装は変更しない（カードのバッジ用に残す）

---

## 1. RPC マイグレーション（047）

`supabase/migrations/047_event_list_progress_state_filter.sql`（次の空き番号は047。取り込み時に採番調整の可能性あり）。

引数を1つ増やすので `create or replace` では差し替えられない。029 と同じく先に旧シグネチャを drop する。

```sql
drop function if exists public.list_owned_event_ids(text, text, text, integer, bigint, text);

create or replace function public.list_owned_event_ids(
  p_filter text default 'active',
  p_category text default 'all',
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset bigint default 0,
  p_query text default null,
  p_display_state text default 'all'
)
returns table(event_ids uuid[], total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  ...
$$;

revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) from public;
revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) from anon;
grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) to authenticated;
```

### 中身の変更点（029 の本文をベースに）

**(a) `normalized` CTE に検証済みの値を足す**

```sql
case
  when p_display_state in (
    'participant_waiting','schedule_creation_waiting','answer_waiting',
    'event_waiting','settlement_waiting','completed','cancelled'
  ) then p_display_state
  else 'all'
end as display_state_value
```

**(b) `plan_state` CTE に集約を2つ足す**

```sql
bool_or(p.status = 'collecting_answers') as has_collecting_answers,
bool_or(
  p.status not in ('cancelled', 'skipped')
  and p.confirmed_start_at is not null
  and p.confirmed_start_at > now()
) as has_upcoming_confirmed
```

`has_upcoming_confirmed` は TS の `hasUpcomingConfirmedSchedule` のミラー。TS 側は
`startOfScheduleTimestamp(plan.confirmed_start_at, is_all_day)` を使うが、`confirmed_start_at` は
`YYYY-MM-DD` 形式ではなく timestamptz なので、実質 `confirmed_start_at > now()` と同値。

**(c) `event_state` の外に `event_display` CTE を足して `display_state` を計算**

`lifecycle_finished` と `settlement_state` は `event_state` の同じ SELECT 内で計算しているため、
兄弟カラムを参照できない。CTE をもう1段かぶせる。

```sql
event_display as (
  select
    es.*,
    case
      when es.lifecycle_finished and es.settlement_state not in ('not_needed', 'settled')
        then 'settlement_waiting'
      when es.status = 'cancelled' then 'cancelled'
      when es.lifecycle_finished then 'completed'
      when coalesce(es.has_collecting_answers, false) then 'answer_waiting'
      when coalesce(es.has_upcoming_confirmed, false) then 'event_waiting'
      when es.status = 'interested' then 'participant_waiting'
      else 'schedule_creation_waiting'
    end as display_state
  from event_state as es
)
```

`event_state` の SELECT に `ps.has_collecting_answers` と `ps.has_upcoming_confirmed` を通す。

分岐の順序は `getEventDisplayState`（`lib/domain/event/event-filter.ts:262`）と**完全に同じ**にする:
1. lifecycle 終了 かつ 清算未了 → `settlement_waiting`
2. `status = 'cancelled'` → `cancelled`
3. lifecycle 終了 → `completed`
4. `collecting_answers` の plan あり → `answer_waiting`
5. 未開催の確定予定あり → `event_waiting`
6. `status = 'interested'` → `participant_waiting`
7. それ以外 → `schedule_creation_waiting`

**(d) `filtered` CTE の元を `event_display` にして、絞り込み節を1つ足す**

```sql
from event_display as ed
cross join normalized as n
where (n.category_value = 'all' or ed.category = n.category_value)
  and ( ...検索... )
  and case n.filter_value ... end          -- 既存の active/cancelled/completed
  and (n.display_state_value = 'all' or ed.display_state = n.display_state_value)
```

`ordered` と最終 SELECT（ページング・件数）は変更なし。`total_count` は `ordered`→`filtered` 経由なので
自動的に `display_state` 絞り込み後の件数になる。

### p_filter と p_display_state の関係

両方 AND で効く。`p_display_state` の5つの進行状態はどれも「未終了」= `p_filter='active'` の部分集合なので、
`active` + サブ状態 は矛盾なく重なる。`completed`/`cancelled` を明示的に `p_display_state` に渡すこともできるが、
page.tsx は `status='active'` のときだけサブ状態を渡す（UI がそう作られている）。

---

## 2. ドメイン（`lib/domain/event/event-filter.ts`）

- `EVENT_LIST_DISPLAY_STATES` 定数（`participant_waiting` … `cancelled` の7値）はすでに
  `EventDisplayState` 型がある。絞り込み用に「進行中のとき選べる5つ」を切り出す:
  ```ts
  export const EVENT_LIST_PROGRESS_STATES = [
    "participant_waiting", "schedule_creation_waiting",
    "answer_waiting", "event_waiting", "settlement_waiting"
  ] as const;
  ```
- `EventListQuery` に `displayState: EventDisplayState | "all"` を追加。
- `normalizeEventListQuery`: `display` パラメータ（URL 上の名前は `display` にする）を検証。
  `EVENT_LIST_PROGRESS_STATES` に含まれ、かつ `status === "active"` のときだけ採用。それ以外は `"all"`。
- `buildEventListHref`: `displayState !== "all"` のとき `&display=<value>` を付ける。`"all"` なら省く。
- `getEventDisplayState` / `getEventCardSummary` は変更しない（カードのバッジ用）。

### URL パラメータ名

`display`（`status` / `category` / `sort` / `limit` / `search` と並ぶ短い名前）。

---

## 3. UI（`components/event/event-list-controls.tsx`）— 2段チップ

絞り込みカードの中、上段の状態チップ帯の**すぐ下**に、下段の帯を置く。

- **表示条件**: `query.status === "active"` のときだけ下段を出す。
- **下段のチップ**: `すべて / 参加者待ち / 日程作成待ち / 回答待ち / 開催待ち / 清算待ち`
  （ラベルは `eventDisplayStateLabels` を流用。「すべて」は `displayState: "all"`）。
- **見た目**: 上段と同じ横スクロール帯・同じチップスタイル。選択中のチップは pine グラデ。
  上段より一段控えめにするため、下段の帯の上に細い区切り（`border-t border-line/60` 程度）か
  小見出し「進行状態」を付ける（実装時に見て決める）。
- **リンク**:
  - 下段チップ → `buildEventListHref({ ...query, status: "active", displayState: X }, 1)`
  - 「すべて」→ `buildEventListHref({ ...query, displayState: "all" }, 1)`
  - **上段チップ**（進行中以外）→ `displayState` を `"all"` にリセットして遷移
    （`buildEventListHref({ ...query, status, displayState: "all" }, 1)`）
- `aria-current` は選択中のチップに付ける。下段の `<nav aria-label="進行状態で絞り込む">`。

### 折りたたみとの関係

下段チップは折りたたみ（「検索・並び替え」details）の**外**、上段チップと同じ並び。
進行状態は状態と同じくらい素早く切り替えたい。

### `detailSummary`

変更しない（カテゴリ・表示順・件数のまま）。進行状態はチップに出るので要約不要。

---

## 4. `app/events/page.tsx`

- `list_owned_event_ids` の RPC 呼び出しに `p_display_state: query.displayState` を追加
  （`normalizeEventListQuery` が `"all"` に正規化済みなので、そのまま渡す）。
- 下書き経路（`query.status === "draft"`）は変更なし。cookie の下書きに進行状態の概念は無い。
- `EventListControls` に渡す `displayQuery` に `displayState` が含まれるよう `normalizeEventListQuery` の
  戻り値をそのまま使う。

---

## 5. テスト

### 5-1. マイグレーションの文字列アサーション

`tests/event/schema/event-list-progress-state.test.ts`（`event-list-search.test.ts` と同じ作法、
コメント除去してから検証）:

- `drop function if exists public.list_owned_event_ids(text, text, text, integer, bigint, text)` がある
- 新シグネチャに `p_display_state text default 'all'` がある
- `display_state` の CASE に7分岐が**この順序で**現れる（`settlement_waiting` → `cancelled` → `completed` →
  `answer_waiting` → `event_waiting` → `participant_waiting` → `schedule_creation_waiting`）
- `has_collecting_answers` と `has_upcoming_confirmed` の集約がある
- `filtered` に `display_state_value = 'all' or ... display_state = ...` の節がある
- `grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) to authenticated` がある
- `revoke ... from anon` がある

### 5-2. DB パリティテスト（`tests/db/`）

`tests/db/event-list-progress-state.test.ts`（`pg` で実DB、CI の `ci-bootstrap-db.sql` 前提）:

- 7つの `display_state` それぞれに当たる event/plan/member を最低1件ずつ seed する
  （テスト用ユーザーを1人作り、その owner でイベントを作る）。
  境界ケースも入れる: 「確定予定が過去」「清算 settling」「plan なしで開催日が過去」など。
- 各 `p_display_state` で RPC を呼び、返る `event_ids` を集める。
- 同じ seed データを `EventListItem` 形に整形し、TS の `getEventDisplayState` で分類する。
- **RPC が返した id 集合 == TS が同じ状態に分類した id 集合** を、7状態すべてで検証する。
- `now()` の扱い: RPC は `now()`、TS は引数の `now`。テストでは `now` を固定し、seed の日時をそれ基準で作る。
  RPC 側は実 `now()` なので、テスト実行時刻に対して十分マージンのある日時（±数日）で seed する。

### 5-3. 単体（`tests/event/event-filter.test.ts`）

- `normalizeEventListQuery`: `display=answer_waiting` + `status=active` → 採用。
  `display=answer_waiting` + `status=completed` → `"all"` に落ちる。不正値 → `"all"`。
- `buildEventListHref`: `displayState` が `"all"` 以外なら `&display=` が付く。`"all"` なら付かない。
  他のパラメータと共存する。

### 5-4. コンポーネント（`tests/event/event-list-controls.test.tsx`）

- `status="active"` のとき下段の `nav[aria-label="進行状態で絞り込む"]` が出る。
- `status="completed"` のとき下段は出ない。
- 下段チップの href が `/events?status=active&display=answer_waiting`（1ページ目）になる。
- 「回答待ち」選択中はそのチップに `aria-current="page"`。
- 上段の「完了」チップの href に `display` が含まれない（リセットされる）。

### 5-5. 実ブラウザ

- 375px / デスクトップ。`進行中` → 下段が出る → 「回答待ち」タップ → 一覧が絞られ件数が変わる。
- 「完了」タップ → 下段が消え、`display` が URL から消える。
- テストデータは `.secrets/seed-batch-a.mjs` を拡張して進行状態を作り分ける（別途）。

---

## 6. 実装フェーズで詰めるディテール（前提として固定）

- 下段帯の見出し/区切りは実装時に実物を見て決める（「進行状態」小見出し or 細い border）。
- `verify-function-privileges`（`scripts/security/verify-function-privileges.mjs` /
  `tests/security/verify-function-privileges.test.ts`）が新シグネチャを見ているか確認し、
  必要なら期待リストを更新する。
- マイグレーションは**手動で SQL エディタに貼る**運用。034 と同様、`docs/current-status.md` の
  チェックリストにも追記する。
- 本番適用のタイミング: 実装・テストが緑になり、実装計画に沿って進めたうえで、
  ユーザーに「047 を本番に流してよいか」を確認してから。

## 出し方

1つの PR（RPC マイグレーション + ドメイン + UI + テスト）。マイグレーション適用は PR マージとは別に、
ユーザーが SQL エディタで実行する。適用前は RPC が6引数のままなので、`p_display_state` を付けて呼ぶと
関数不一致で 400 になる → **page.tsx の RPC 呼び出しは、047 適用後にデプロイされる前提**。
デプロイ順（migration 先 → コードデプロイ後）を PR 説明と STATE.md に明記する。
