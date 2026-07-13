# Madoi 本番公開準備

現在のSupabaseプロジェクトをそのまま本番運用へ移す手順です。別のテスト環境は作りません。公開前にテストデータだけを削除し、本番URL、Google OAuth、Vercelの設定を本番用にそろえます。

## 最初に確認すること

Google OAuthには次の2段階があります。

- **公開設定のみ**: Googleログインは誰でも使える。ただし未審査のCalendar権限には警告が出て、Calendar連携の新規ユーザー数は100人で止まる。
- **審査完了後**: GoogleログインとCalendar連携を、警告や新規ユーザー上限なしで公開できる。

MadoiはGoogle Calendarの予定作成と空き状況確認を扱うため、本番公開前にGoogle審査まで進める方針にします。

## 1. 現在のSupabaseプロジェクトを本番として使う

1. 現在使っているSupabaseプロジェクトを開く。
2. `SQL Editor` を開き、`supabase/migrations` の `001` から `018` がすべて実行済みか確認する。
3. 未実行のマイグレーションだけを、ファイル名順に1ファイルずつ実行する。
4. プロジェクトの `Project URL`、`anon key`、`service_role key` を控える。値そのものはチャット、Git、画面共有に載せない。

`016` は既存の `set_updated_at()` 関数を使うため、必ず前のマイグレーションから順に実行します。

## 2. 独自ドメインを用意する

Google OAuthの審査では、ホームページ、利用規約、プライバシーポリシーを自分で所有・確認できるドメインに置く必要があります。`vercel.app` の共有ドメインだけでは審査を進められません。

1. 利用する独自ドメインを決める。すでに持っているドメインがあればそれで構いません。
2. 本番URLを決める。例: `madoi.example.com` または `example.com`。
3. ドメイン管理画面へ入れるGoogleアカウントを、Google Cloudプロジェクトのオーナーまたは編集者にする。

## 3. Vercelへ配置する

1. [Vercel](https://vercel.com/new) を開く。
2. GitHub の `yuhi-riddle/play-sync-planner` をImportする。
3. プロジェクトを作成する。
4. `Settings` -> `Domains` を開き、本番URLのドメインを追加する。
5. Vercelに表示されたDNSレコードを、ドメイン管理会社のDNS設定へそのまま登録する。
6. Vercelでドメインの状態が `Valid Configuration` になったことを確認する。
7. 以後、`https://<あなたの本番ドメイン>` をMadoiの公開URLとして使う。

## 4. Vercelの環境変数を設定する

Vercelプロジェクトの `Settings` -> `Environment Variables` で、次を `Production` と `Preview` に登録します。

```text
NEXT_PUBLIC_SUPABASE_URL=<現在使っているSupabase Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<現在使っているSupabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<現在使っているSupabase service_role key>
NEXT_PUBLIC_SITE_URL=https://<あなたの本番ドメイン>
GOOGLE_CALENDAR_CLIENT_ID=<Google OAuth Client ID>
GOOGLE_CALENDAR_CLIENT_SECRET=<Google OAuth Client Secret>
GOOGLE_CALENDAR_REDIRECT_URI=https://<あなたの本番ドメイン>/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=<32バイト以上のランダムな鍵>
CRON_SECRET=<十分に長いランダム文字列>
```

`SUPABASE_SERVICE_ROLE_KEY`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`CALENDAR_TOKEN_ENCRYPTION_KEY`、`CRON_SECRET` はブラウザに出してはいけません。環境変数を変更した後は、Vercelで再デプロイします。

## 5. Supabase Authを設定する

Supabase の `Authentication` -> `URL Configuration` を開き、以下を設定します。

```text
Site URL
https://<あなたの本番ドメイン>

Redirect URLs
https://<あなたの本番ドメイン>/**
http://localhost:3000/**
```

続けて `Authentication` -> `Sign In / Providers` -> `Google` でGoogleログインを有効にし、Google OAuth Client IDとSecretを登録します。

## 6. Google OAuthを公開設定する

### 6-1. Google Search Consoleでドメイン所有を確認する

1. [Google Search Console](https://search.google.com/search-console) を開く。
2. `プロパティを追加` を選び、`ドメイン` を選択する。
3. `あなたのドメイン` を入力する。`https://` やサブドメインは付けない。
4. 表示されたTXTレコードを、ドメイン管理会社のDNS設定に追加する。
5. Search Consoleへ戻り、`確認` を押す。

### 6-2. Google Auth Platformのブランド情報を設定する

1. [Google Cloud Console](https://console.cloud.google.com/) でMadoiのプロジェクトを開く。
2. `Google Auth Platform` -> `ブランディング` を開く。
3. 次を入力して保存する。

```text
アプリ名: Madoi
ユーザーサポートメール: 問い合わせを受けるメールアドレス
ホームページ: https://<あなたの本番ドメイン>
プライバシーポリシー: https://<あなたの本番ドメイン>/privacy
利用規約: https://<あなたの本番ドメイン>/terms
デベロッパーの連絡先: あなたのメールアドレス
```

4. `承認済みドメイン` に `あなたのドメイン` を追加する。

ホームページはログイン画面だけでは審査要件を満たしません。Madoiが何をするアプリか、Google Calendar情報を何のために使うか、プライバシーポリシーへのリンクを、ログイン前に読める形で載せる必要があります。この画面はアプリ側で追加してから設定します。

### 6-3. 対象とデータアクセスを設定する

1. `Google Auth Platform` -> `対象` を開く。
2. User Type を `External` にする。
3. `Publish app` を押し、状態を `In production` にする。
4. `Test users` は追加しない。
5. `Google Auth Platform` -> `データアクセス` を開く。
6. 実際に使う次のCalendar権限を登録する。

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.freebusy
```

### 6-4. OAuth ClientのURLを設定する

Google Cloud ConsoleのOAuth Clientで、以下を登録します。

```text
承認済みのJavaScript生成元
https://<あなたの本番ドメイン>
http://localhost:3000

承認済みのリダイレクトURI
https://<現在使っているSupabaseのProject Ref>.supabase.co/auth/v1/callback
https://<あなたの本番ドメイン>/api/google-calendar/callback
http://localhost:3000/api/google-calendar/callback
```

### 6-5. Google審査を申請する

1. `Google Auth Platform` -> `検証センター` を開く。
2. `Prepare for verification` を選ぶ。
3. 各Calendar権限について、Madoiが日程候補の重なり確認と確定予定の作成・招待に使うことを説明する。
4. 英語で、Googleログイン、Calendar連携、候補日時の空き状況表示、確定予定の作成が分かる操作動画を作る。YouTubeへ `Unlisted` でアップロードする。
5. 動画URL、公開URL、プライバシーポリシーURL、利用規約URLを入力して申請する。

審査が終わる前でも誰でもGoogleログインはできます。ただしCalendar連携には「未確認アプリ」の警告が出て、100人の新規ユーザー上限があります。Calendar連携を広く案内するのは、審査が通ってからにします。

## 7. テストデータを削除する

この手順は、現在のデータがすべてテストデータだと確認できた場合だけ実行します。実行後に元へ戻せません。実際の予定、清算、メッセージが1件でも入っている場合は、ここで止めて削除対象を個別に確認します。

### 7-1. 削除前に件数を確認する

Supabaseの `SQL Editor` で、次を実行します。結果を確認し、消してはいけないデータがないことを確かめます。

```sql
select 'events' as table_name, count(*) as row_count from public.events
union all select 'plans', count(*) from public.plans
union all select 'participants', count(*) from public.participants
union all select 'candidate_dates', count(*) from public.candidate_dates
union all select 'availability_answers', count(*) from public.availability_answers
union all select 'expenses', count(*) from public.expenses
union all select 'settlements', count(*) from public.settlements
union all select 'event_messages', count(*) from public.event_messages
union all select 'notifications', count(*) from public.notifications;
```

### 7-2. テストデータを削除する

確認結果に問題がなければ、同じ `SQL Editor` で次を1回だけ実行します。イベント、候補日時、回答、清算、通知、接続、Calendar連携情報、同意記録を削除します。`auth.users` は削除しません。

```sql
truncate table
  public.availability_answers,
  public.candidate_dates,
  public.event_drafts,
  public.event_invite_links,
  public.event_members,
  public.event_messages,
  public.event_user_invitations,
  public.events,
  public.expense_splits,
  public.expenses,
  public.notifications,
  public.participants,
  public.payment_proofs,
  public.plan_reminder_logs,
  public.plan_reminder_settings,
  public.plans,
  public.settlement_payments,
  public.settlement_reminder_logs,
  public.settlements,
  public.share_links,
  public.user_blocks,
  public.user_connections,
  public.user_consents,
  public.user_favorites,
  public.calendar_integrations
restart identity cascade;
```

### 7-3. Googleログインしたテストアカウントを扱う

- 普段使う自分のGoogleアカウントは残して構いません。初回アクセス時に利用規約とプライバシーポリシーへ再同意し、Google Calendarも再連携します。
- 使わないテストアカウントだけを消す場合は、Supabaseの `Authentication` -> `Users` で対象メールアドレスを確認し、1件ずつ削除します。
- `auth.users` をSQLでまとめて削除しないでください。ログイン情報とアプリのデータの対応が壊れるおそれがあります。

## 8. 本番公開前の確認

主催者、招待される人、Google Calendar未連携の人の3役で確認します。

1. 利用規約とプライバシーポリシーへ同意してGoogleログインできる。
2. イベント作成と下書き保存、下書き破棄ができる。
3. 共有リンクから参加できる。
4. アプリ内招待を承諾・辞退できる。
5. つながり、フォロー、お気に入り、ブロックが動く。
6. Google Calendarを連携し、候補日時作成で参加者全体の空きやすさを表示できる。
7. 日程確定、Calendarへの登録、清算、イベント内チャットを確認する。

## 9. 本番公開後の運用

- 問い合わせ先を1つに決め、画面、操作手順、発生日時、エラー文を残してもらう。
- 本番データをまとめて削除しない。テスト用イベントを作る場合は、予定名の先頭に `テスト:` を付けて区別する。
- Google OAuthの公開設定とCalendar権限の審査状況を、公開前に確認する。
