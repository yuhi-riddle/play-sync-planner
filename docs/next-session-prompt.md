# 次セッション用プロンプト

以下をコピーして次のセッションの最初に貼る。

---

play-sync-planner の続き。

前回セッション（2026-08-10）までに main へマージ・push 済み（HEAD は `feat/welcome-hero` のマージ）。
172ファイル / 1061テスト全通過、lint・build もクリーン。

まず `C:\Users\yuyan\.claude\memory\MEMORY.md`（索引）を読んで状況を確認してほしい。

## 直近で入ったもの

- **ゲスト参加者の廃止** — 共有ページ（`/s/[token]/answer`、`/s/[token]/settlement`）を
  ログイン必須にし、名前を選ばせるUIと `?viewer=` を消した
- **共有ページの参加者RLS（migration 030）** — それまで全ポリシーが
  `plans.owner_user_id = auth.uid()` のオーナー限定で、参加者は1行も読めなかった。
  だから `/s/` は service role を使っていた。`security definer` のヘルパー6本を足して
  参加者スコープを作り、両ページを本人のクライアントに移した。
  列は RLS で絞れないため `settlement_status` だけは RPC `mark_plan_settling` 経由
- **Googleカレンダー連携の任意化** — 招待参加時の強制リダイレクトを外した。
  空きの集計の母数は「参加者総数」ではなく「連携している人数」。ここを総数のままにすると、
  未連携の人が busy に出ないぶん、そのまま空き扱いになる
- **ウェルカム画面** — 未ログインのホームを `LoginPanel` から `WelcomeHero` に差し替え。
  入口は `/login` へのボタン1つ（認証はGoogleだけなので押し分けは作らない）

## 先に片付けたいもの

**A. migration 031 の適用**

`supabase/migrations/031_drop_guest_participant_type.sql` がまだ本番に流れていない。
`participants.participant_type` の既定値を `registered` にして、
CHECK 制約から `'guest'` を落とすだけ。流したら伝えるので、確認SQLを出してほしい。

**B. 利用規約に利用者の範囲を明記**

ゲスト参加が無くなり、利用者は全員ログイン済みになった。規約の文面がまだ追いついていない。
問い合わせ先・運営者情報を自分が決めたら着手する（未定のあいだは触らない）。

**C. `plans.title` が3件とも null**

本番の掃除後に残った3件。コード側でどう扱うかを決めたい。

## そのあと（順不同、相談したい）

- **`feat/event-search`（`771b108`）の作り直し** — フォルダ構成が変わったので、
  そのままでは載らない。migration 029 は main にあり本番にも適用済み
- **`.ics` 書き出し** — いまは「Google Calendarに追加」しかなく、連携が任意になったぶん
  Googleを使っていない人の出口が無い
- **`event_members` の表示名ずれ** — 古いスナップショットが「ゆう」「ゆうひ」を持ち続ける。
  どちらを正とするか決める必要がある
- **ホームの大小メリハリ** — 案A/案Bを作ったがいったん棚上げ（2026-08-10、本人判断）
- **codex/performance-security-foundation の分割取り込み計画** — 112ファイル・+14,413行。
  マイグレーションは032番以降で書き直し。**このブランチは消さないこと**

## 小さい繰り越し（急がない）

- `CRON_SECRET` を Vercel と GAS で揃える（本人作業）
- 同型のエラー握り潰しが他に23箇所（`const { data: x } = await supabase` で error を捨てる）。
  うち8箇所は `notFound()` も併用。ページごとに正しい振る舞いが違うので一括修正は危険
- `terminalStatuses` が `lib/event-filter.ts` にあり `lib/domain/` がそこに依存している。
  `lib/domain/event-status.ts` が本来の置き場所
- `app/layout.tsx` に `import React` が無い
- チャットの `aria-live` が1800文字超で打鍵ごとに発火して冗長。送信失敗→再送のテストも無い
- 清算画面のバナー「受け取り方法が未設定の清算があります」が実態（本人のみ設定可能）とズレている
- リモートブランチの後片付け（`feat/expense-form-usability`、`redesign/madoi-brushup`、
  `wip/legacy-helper-test`、`wip/member-first-answer-gate`）

---

## 前回までの学び（次も効くはず）

- **テストは `--reporter=dot` で流す。** 既定のレポーターは170ファイル分を吐く。
  `npx vitest run --reporter=dot 2>&1 | tail -n 12` なら結果は1行
- **本番DBへの書き込みは通らない。** 回避しようとせず、SQLを出して本人に
  Supabase SQL Editor で流してもらう。SQL Editor は**最後の文の結果しか表示しない**ので、
  確認は1本の `select` にスカラーサブクエリを並べる形で書く
- **最終レビュー（全体diff）はOpusで必ずやる。** 個別タスクのレビューが全部Approvedでも、
  そのあと自分たちが入れた退行を2件拾った
- **計画に書いたテストコードを疑う。** 守るべき分岐を一度も通っていないテストが混ざっていた。
  ミューテーション検査を実装者にやらせると確実
- **設計は具体シナリオで殴ると穴が出る。**「旅行で二手に分かれたら?」の一言で進行表の
  所要時間ロジックが破綻すると分かった
