# 当日の進行表（タイムスケジュール）設計

作成: 2026-08-03

## 背景と目的

日程が確定したあと、当日の進行を時刻付きで共有する手段が無い。
既存のタスク機能（`event_tasks`）は「持ち物・役割の分担」であり、時刻を持たず、
日程が決まる前から使い始める前提でイベントに紐づいている。進行表はこれとは別物で、
**日程が確定してはじめて書けるもの**なので、別テーブル・別画面として作る。

## スコープ

### 含む

- `plans` に紐づく進行表の作成・編集・削除
- 複数担当（0人／1人／複数）
- 複数日にまたがるイベントの日付見出し
- 二手に分かれる進行（時間帯の重なりをブロック表示）
- 現在時刻から「いまここ」を自動判定
- 進行表の追加UI（後述の共通作法をここで初めて実装する）

### 含まない（別docに回す）

- 立替フォームの専用ページ化
- 既存3箇所（タスク追加バー・立替フォーム・支払いを記録）の追加UI統一
- `event_tasks` の複数担当化
- 受け取り方法の複数指定
- Google Calendar への進行表出力、進行表更新の通知、テンプレート／コピー、同時編集の排他制御
- 公開リンク（非ログイン）での閲覧

## 決定事項

| 項目 | 決定 | 理由 |
|---|---|---|
| 紐づけ先 | `plans` | 開催日時 `confirmed_start_at` が plans にあり、進行表は日程確定後のものだから |
| 担当の参照先 | `participants` | `user_id` が nullable なのでアプリ未登録の人にも担当を付けられる。退会（023）でも行が残るため表示が壊れない |
| 閲覧・編集範囲 | イベントメンバー全員 | 既存の `is_event_member()` をそのまま使える。タスク・チャットと同じ範囲 |
| 終了時刻 | 任意（nullable） | 一本道なら不要だが、二手に分かれるときは所要時間の推定が破綻するため必要 |
| 並び順カラム | 持たない | `start_at` で並ぶ。同時刻は `created_at` で決着 |
| 置き場所 | `/plans/[planId]/timetable` | plan 詳細（21.8KB）をこれ以上太らせない。当日は開きっぱなしにできる |
| 時刻未定の項目 | 作らない | `start_at` を nullable にすると並び順・所要時間・いまここ判定・分岐判定の全部に null 分岐が増える。仮の時刻＋メモで足りる |
| 班（グループ）テーブル | 作らない | 担当チップで誰がどちらかは表現できる。重なりから分岐は導出できる |

## データモデル

マイグレーション番号は **028 以降**。`codex/performance-security-foundation` ブランチ（未マージ）も
028 以降を使う予定なので、取り込み時に採番の調整が要る。

```sql
create table if not exists public.plan_timetable_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  title text not null check (char_length(trim(title)) > 0 and char_length(title) <= 100),
  note text check (note is null or char_length(note) <= 500),
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_timetable_items_range_check check (end_at is null or end_at >= start_at)
);

create index if not exists plan_timetable_items_plan_id_start_at_idx
  on public.plan_timetable_items(plan_id, start_at);

create table if not exists public.plan_timetable_item_assignees (
  item_id uuid not null references public.plan_timetable_items(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, participant_id)
);

create index if not exists plan_timetable_item_assignees_participant_id_idx
  on public.plan_timetable_item_assignees(participant_id);
```

`updated_at` は既存の `public.set_updated_at()` トリガーを使う（`event_tasks` と同じ流儀）。

### RLS

`is_event_member()` は event_id を引数に取るので、plan から event_id を引く必要がある。
`plan_timetable_items` は `plan_id` しか持たないため、判定はサブクエリになる。

```sql
using (
  public.is_event_member(
    (select p.event_id from public.plans p where p.id = plan_timetable_items.plan_id)
  )
)
```

テーブル名で修飾するのは、サブクエリ内の `plans` の列と行の `plan_id` が
紛れないようにするため。

`plan_timetable_item_assignees` は親の item を経由して同じ判定を行う。

方針は `event_tasks`（024）に揃える。

- select / insert / update / delete の4本をメンバー全員に開く
- insert のみ `created_by_user_id = auth.uid()` を追加で要求する
- 「担当の付け替えや完了は誰が作ったものでもメンバーなら操作できる」という 024 の考え方を踏襲する

新テーブルの GRANT は既存マイグレーションの流儀をコピーする（忘れると 42501）。

## ドメインロジック

`lib/domain/plan-timetable.ts` に置き、テストは `tests/domain/plan-timetable.test.ts`（プロジェクトの慣習）。

責務は4つ。**すべて純関数**にして、画面から切り離してテストする。

### 1. 並び替え

`start_at` 昇順、同時刻は `created_at` 昇順。

### 2. 日付グループ化

`start_at` の日付（JST）でグループ化する。**グループが1つだけなら見出しを出さない**。
日をまたぐ項目（22:00–翌2:00）は `start_at` の日付に属する。

### 3. 分岐ブロックの検出

**`end_at` を持つ行同士で時間帯が重なるとき**だけ、ひとつのブロックにまとめる。

`end_at` が無い行は分岐に参加しない。これは「13:00 集合」「13:00 受付開始」のような
**同時刻の連続項目を分岐と誤判定しないため**。分岐として見せたければ終了時刻を入れる、という
明示的なルールにする。

重なりは推移的に連結する（A と B が重なり、B と C が重なれば A・B・C で1ブロック）。

ブロック内は**担当の組み合わせごとにレーンへ分ける**。同じ担当の行は同じレーンに時刻順で積む。
担当が空の行は単独レーンにする。

**レーンが3つ以上になったら横並びをやめて縦積みにし、レーン見出しに担当チップを出す。**
375px で3列に割ると1列100px を切って読めなくなるため。

### 4. 所要時間

- `end_at` があれば `end_at - start_at`
- 無ければ「次に始まる行の `start_at`」との差で推定する。同時刻の行は飛ばす
- 最後の行、または次の行が無い場合は出さない

### 5. いまここ判定

現在時刻を引数で受け取る純関数にする（`vitest.setup.ts` が時刻を固定しているため、
関数内で `new Date()` を呼ばない）。

「開始済みで、まだ終わっていない行」の **id の集合**を返す。`end_at` があればそれで、
無ければ次に始まる行の開始時刻で判定する。該当が無ければ空集合（開始前・終了後）。

**集合を返すのは、二手に分かれている間は同時に複数の行が進行中になるため。**
一本道の区間では必ず1件以下になる。

判定は**サーバー描画時の時刻**で行う。全ページ `force-dynamic` なので再読込で追いつく。
クライアント側のタイマーは入れない。

## 画面

### ルート

```
app/plans/[planId]/timetable/
  page.tsx
  loading.tsx
```

`error.tsx` は `[planId]/` 直下のものが子ルートも拾うので新設しない。
`loading.tsx` を追加するので `tests/route-loading-skeletons.test.tsx` の更新が要る。

plan 詳細からの導線は「支払い・清算へ」の隣に「当日の進行表へ」を置く。
**`isConfirmed` のときだけ**表示する。

### 表示

- ヘッダー: イベント名 / plan タイトル / 開催日時
- 日付見出し（複数日のときだけ）
- 行: 時刻・タイトル・メモ・所要時間・担当チップ
- 分岐ブロック: 「⑂ HH:MM から 二手に分かれる」「⑃ HH:MM に合流」で挟む
- 「▶ いまここ」をハイライト（分岐中は各レーンで同時に光ることがある）
- 空のとき: EmptyState

### 辞退した参加者

`participants.status` が `declined` / `cancelled` の人は、

- **新規の担当候補からは外す**
- **すでに担当になっている場合は消さず**、取り消し線＋「辞退」バッジで表示し続ける

勝手に担当が消えるほうが事故になるため。

### 中止・未確定の plan

`isConfirmed` でない plan の進行表は、URL 直打ちで閲覧はできるが**編集不可**にする。

## 追加UIの作法

進行表で初めて実装し、以後これをプロジェクトの標準とする。既存3箇所への展開は別doc。

### 入口はどの画面でも同じ

折りたたまれた「＋ ◯◯を追加」の行。開いていない状態が既定。

### 押した後の挙動は「性質」で決める

| 性質 | 挙動 | 対象 |
|---|---|---|
| 繰り返し足す軽いもの | その場で開く（`<details>`） | 進行表の行、タスク追加、支払いを記録 |
| 分岐や計算があり一度きり慎重に入れるもの | 専用ページへ遷移 | 立替の追加・編集（別doc） |

フィールド数ではなく**足す頻度**で分ける。この基準なら「なぜここだけ違うのか」に一言で答えられる。

`<details>` を使う理由は、開閉にクライアントJSが要らず、Server Actions の
`<form action>` をそのまま置けるため。このアプリはサーバー描画中心なので、
追加のクライアント状態を持ち込まない形が合う。

### 入力欄

- **時刻はネイティブ `<input type="time">`**。ピッカーの自作はしない。
  `min` / `max` は付けない（iOS Safari で当てにならず、深夜や前日入りを弾く理由もない）
- **日付欄は複数日のときだけ出す**。単日イベントでは開催日を自動で使い、時刻だけ聞く
- **終了時刻は「終了（任意）」として時刻の隣に置く**
- **担当はトグルチップ**。参加者は10人を超えないので検索は出さない。押すたび選択／解除。
  「全員」チップは押すと全員を選択した状態にする（専用フラグは持たない）
- 初期値: 時刻は「最後の行の1時間後」

### キーボード対策

**開いたら `scrollIntoView({ block: "center" })` でフォームを画面中央に寄せる。**

iOS はキーボードを画面に重ねるだけ、Android はレイアウトをリサイズするため、
放置すると入力欄がキーボードに隠れる。`<details>` の開閉自体はJSゼロのままだが、
このスクロールのためだけに小さなクライアントコンポーネントを1つ置く。

実機確認の観点に「iOS と Android の両方でフォームが隠れないこと」を入れる。

### ボタンの強さ

「追加」は主CTA（`bg-ink text-white`）、「やめる」はただの文字リンク。
一覧側の行操作アイコンはこれより弱くする。

## 守る視覚言語

暖色の紙（canvas `#efe7d8` / surface `#fffdf7`）、丸ピル、控えめな苔緑（moss `#5f7d65`）、
影は最小限。新しい色やコンポーネントは足さない。

## テスト方針

- ドメインロジックは `tests/domain/plan-timetable.test.ts` に純関数として集約する
- 分岐検出は「`end_at` の無い同時刻2行を分岐と判定しないこと」を**負のテストで固定する**
- 所要時間は「不均等に分かれた場合に正しく出ること」をテストで固定する
- いまここ判定は現在時刻を引数で受け取り、開始前・進行中・終了後の3状態を検証する。
  **分岐中に複数の行が同時に返ること**も固定する
- マイグレーションは SQL ファイルを `readFileSync` して文字列検証する（DBには接続しない）。
  コメントを除去してから検証し、ガードがコメントに退避する抜けを塞ぐ
- `tests/route-loading-skeletons.test.tsx` に新ルートのスケルトンを追加する
- 認証は `getCurrentUser()` / `getCurrentUserId()` 経由（`tests/no-raw-auth-getuser.test.ts` がガード）

## 参考にした指針

- インライン追加・編集は摩擦が最小で文脈が途切れない — [Pencil & Paper](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) / [UX Design World](https://uxdworld.com/inline-editing-in-tables-design/)
- ボトムシートは1ステップの操作に限る。多段フローはフルスクリーンの遷移先へ — [Material Design 3](https://m3.material.io/components/bottom-sheets/guidelines) / [NN/g](https://www.nngroup.com/articles/bottom-sheet/)
- 日時ピッカーの自作はほぼ常に誤り。ネイティブ入力を使う — [Eleken](https://www.eleken.co/blog-posts/time-picker-ux) / [OpenReplay](https://blog.openreplay.com/custom-date-picker/)
- 複数選択は削除可能なチップで示し、候補が10件を超えたら検索を出す — [UX Patterns for Developers](https://uxpatterns.dev/patterns/forms/multi-select-input)
- モバイルのキーボードは iOS が重ね、Android がリサイズする — [Pixelform](https://usepixelform.com/blog/mobile-form-design/) / [MDN](https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API)

## 検討したが採らなかった案

- **終了時刻を持たない（当初案）** — 二手に分かれると所要時間の推定が破綻する。不均等な分岐で誤った値が出る
- **終了時刻を必須にする** — 実装は単純になるが、一本道の部分でも毎行入力が要る
- **班（グループ）テーブルを持つ** — 表現力は上がるが、テーブル3枚目とUIの複雑さに見合わない
- **ボトムシートで追加UIを統一** — 多段フォームには不適という指針が複数ある。既存の `legal-modal.tsx` は表示専用でフォームを持たず、流用しても各フォームに `useActionState` の開閉制御を書くことになる
- **イベント詳細の5つ目のタブ** — タブが5つになり375pxで狭い。plan 紐づけなのにイベント側に置くと、複数 plan があるときに破綻する
