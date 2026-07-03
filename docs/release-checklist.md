# Madoi リリース前チェックリスト

最終更新: 2026-07-03

このドキュメントは、Madoi を「いったん使える状態」として確認するための手順です。
新機能を増やすための一覧ではなく、公開前に詰まりやすいところを潰すために使います。

## 1. ローカル環境

- [ ] `.env.local` がある。
- [ ] `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` が入っている。
- [ ] `.env.local` に `NEXT_PUBLIC_SUPABASE_ANON_KEY` が入っている。
- [ ] `.env.local` に `SUPABASE_SERVICE_ROLE_KEY` が入っている。
- [ ] `.env.local` に `NEXT_PUBLIC_SITE_URL=http://localhost:3000` が入っている。
- [ ] Google Calendar 連携を使う場合、`GOOGLE_CALENDAR_CLIENT_ID` が入っている。
- [ ] Google Calendar 連携を使う場合、`GOOGLE_CALENDAR_CLIENT_SECRET` が入っている。
- [ ] Google Calendar 連携を使う場合、`GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback` が入っている。
- [ ] Google Calendar 連携を使う場合、`CALENDAR_TOKEN_ENCRYPTION_KEY` が入っている。

## 2. Supabase マイグレーション

Supabase Dashboard の SQL Editor で、次の順番に実行します。

- [ ] `supabase/migrations/001_phase1_schema.sql`
- [ ] `supabase/migrations/002_calendar_integrations.sql`
- [ ] `supabase/migrations/003_plan_reminder_settings.sql`
- [ ] `supabase/migrations/004_plan_reminder_logs.sql`
- [ ] `supabase/migrations/005_settlement_core.sql`
- [ ] `supabase/migrations/006_settlement_payments.sql`
- [ ] `supabase/migrations/007_expense_important_notes.sql`
- [ ] `supabase/migrations/008_settlement_reminder_type.sql`
- [ ] `supabase/migrations/009_site_notifications.sql`

途中でエラーが出た場合は、実行したファイル名とエラー全文を控えます。

## 3. Google 設定

- [ ] Supabase Auth の Google Provider が有効になっている。
- [ ] Google Cloud の OAuth Client に Supabase Auth callback が登録されている。
- [ ] Google Calendar 用 OAuth Client に `http://localhost:3000/api/google-calendar/callback` が登録されている。
- [ ] Google Auth Platform のテストユーザーに、自分のGoogleアカウントが入っている。
- [ ] Google Calendar のスコープに `https://www.googleapis.com/auth/calendar.events` が入っている。
- [ ] 設定画面で「読み取り専用」の警告が出る場合は、`再連携する` からGoogle Calendarをつなぎ直している。

## 4. 通知

- [ ] `009_site_notifications.sql` を適用済み。
- [ ] ローカルで `http://localhost:3000/api/cron/notifications` を開いて、エラーにならない。
- [ ] 通知が作られた場合、ヘッダーのベルに未読件数が表示される。
- [ ] ホームの「対応が必要なこと」に未読通知が表示される。
- [ ] `/notifications` で通知一覧が開ける。
- [ ] `/notifications` の初期表示では未読通知だけが表示される。
- [ ] `/notifications?status=read`、または画面上の「既読」切替で既読通知が表示される。
- [ ] 通知を既読にできる。
- [ ] すべて既読にしたあと、未読件数が0になる。

本番では `vercel.json` により、1時間ごとに `/api/cron/notifications` を実行します。
`CRON_SECRET` を設定した場合は、手動実行時に `Authorization: Bearer <CRON_SECRET>` が必要です。

## 5. 手動確認シナリオ

ブラウザ確認は、ユーザーが明示したタイミングで行います。

- [ ] Google でログインする。
- [ ] イベントを作成する。
- [ ] イベントに参加予定を作成する。
- [ ] 候補日時を複数追加する。
- [ ] 候補日時を選ぶ画面で Google Calendar の予定が見える。
- [ ] 共有回答リンクを別ブラウザ、またはシークレットウィンドウで開く。
- [ ] 日程回答を送信する。
- [ ] 予定詳細で回答状況を確認する。
- [ ] 候補日時を確定する。
- [ ] Google Calendar に確定予定が追加される。
  - 追加されない場合は、設定画面でGoogle Calendar連携が読み取り専用になっていないか確認する。
- [ ] 立替支払いを追加する。
- [ ] 清算結果を確認する。
- [ ] 支払い依頼文面をコピーする。
- [ ] 公開清算リンクを開く。
- [ ] 一部支払いを記録する。
- [ ] 主催者の清算ページで、受け取り確認待ちに表示される。
- [ ] 主催者として受け取り確認する。
- [ ] 全員分が終わると清算完了が表示される。
- [ ] 通知画面で未読・既読を切り替えられる。

## 6. コマンド確認

PowerShell で実行します。

```powershell
npm.cmd test
npm.cmd run build
```

どちらも成功すれば、コード上の基本確認は完了です。

## 7. 公開前に決めること

- [ ] 利用規約の問い合わせ先を決める。
- [ ] プライバシーポリシーの問い合わせ先を決める。
- [ ] 本番の `NEXT_PUBLIC_SITE_URL` を決める。
- [ ] 本番の Google OAuth redirect URI を追加する。
- [ ] 本番の Vercel Cron で `CRON_SECRET` を使うか決める。
- [ ] 外部決済API連携は、今回の公開範囲に含めないことを確認する。
- [ ] メール、X、LINE、Discord への自動送信は、今回の公開範囲に含めないことを確認する。

## 8. 2026-07-03 Codex確認メモ

確認済み:

- `.env.local` に、ローカル確認に必要な環境変数が入っていることを確認した。値そのものは表示していない。
- `npm.cmd test` が成功した。
- `npm.cmd run build` が成功した。
- `http://localhost:3000/` が表示できる。
- `http://localhost:3000/login` が表示できる。
- `http://localhost:3000/terms` が表示できる。
- `http://localhost:3000/privacy` が表示できる。
- 未ログイン状態の `http://localhost:3000/notifications` が案内表示になる。
- 開発環境で `http://localhost:3000/api/cron/notifications` が `{ "created": 0 }` を返す。
- 不正な共有リンクで、Madoi用の日本語404画面が表示される。

未確認:

- Googleログイン後のイベント作成から清算完了までの実操作。
- Google Calendarへの予定登録。
- ログイン後の通知未読・既読切替。
- 本番環境のSupabase、Google OAuth、Vercel Cron設定。
