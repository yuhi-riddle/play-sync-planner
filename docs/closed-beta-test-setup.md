# Madoi 本番公開手順

この手順では、現在使っているSupabaseプロジェクトをそのまま本番として運用します。別のテスト環境は作りません。公開前にテストデータだけを削除し、Madoiの本番URLを `https://madoi.app` に統一します。

> [!WARNING]
> Google Calendarの権限を、誰でも警告なしで使えるようにするにはGoogleのOAuth審査が必要です。審査前でもGoogleログインは公開できますが、Calendar連携には警告が出て、新規連携ユーザーは合計100人までです。

## 0. 先に全体像をつかむ

ここで出てくる名前は次の意味です。

```text
ドメイン名: madoi.app
MadoiのURL: https://madoi.app
利用規約のURL: https://madoi.app/terms
プライバシーポリシーのURL: https://madoi.app/privacy
Calendar連携の戻り先URL: https://madoi.app/api/google-calendar/callback
```

ドメイン名は住所の名前で、URLは `https://` やページの場所まで含めた完全な住所です。

作業の順番は次のとおりです。途中でエラーが出たら、先へ進まず、画面全体と表示されたエラー文を保存します。

1. Cloudflareで `madoi.app` を購入する。
2. VercelへMadoiを配置し、`madoi.app` をつなぐ。
3. Vercelへ本番用の環境変数を設定する。
4. Supabase Authの戻り先URLを本番URLへ変える。
5. Google CloudでCalendar API、OAuth、ドメイン確認を設定する。
6. Google OAuthを公開設定にし、審査を申請する。
7. テストデータを確認してから削除する。
8. 本番URLで最終確認する。

## 1. Cloudflareで `madoi.app` を購入する

### 1-1. Cloudflareアカウントを作る

1. ブラウザで [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) を開く。
2. 右上の `Sign up` を押す。
3. 普段使うメールアドレスとパスワードを入力し、`Sign up` を押す。
4. Cloudflareから届く確認メールを開く。
5. メール内の確認リンクを押す。
6. Cloudflareに戻り、ログインできることを確認する。
7. 右上の人型アイコンから `My Profile` を開く。
8. `Authentication` を開き、二要素認証を有効にする。
9. 表示された復旧コードは、パスワード管理アプリなど安全な場所に保存する。

### 1-2. ドメインを検索して購入する

1. Cloudflareのダッシュボードで `Domain Registration` または `Register Domains` を開く。
2. 検索欄に `madoi.app` と入力する。
3. `Search` を押す。
4. `madoi.app` が購入可能なら、表示された `Purchase` を押す。
5. 取得済みなら、次の順で検索する。
   - `madoiapp.com`
   - `madoi.jp`
6. 年数は最初は `1 year` で構わない。更新忘れを防ぐため、自動更新は有効のままにする。
7. 氏名、住所、電話番号、メールアドレスを入力する。氏名や住所はローマ字で入力する。
8. 表示される登録規約を確認し、同意する。
9. 支払い方法を入力する。
10. `Complete purchase` を押す。
11. 購入完了画面と確認メールが届いたことを確認する。

### 1-3. 購入後に確認する

1. Cloudflareの `Manage Domains` を開く。
2. `madoi.app` が一覧にあることを確認する。
3. `madoi.app` を押す。
4. `Domain Registration` で `Auto-renew` が有効であることを確認する。
5. Cloudflareから登録者メール確認が届いた場合は、必ずメール内の確認リンクを押す。

Cloudflareで購入したドメインは、DNSもCloudflareで管理します。以後、DNSレコードを追加するときはCloudflareの `madoi.app` -> `DNS` -> `Records` を開きます。

## 2. VercelへMadoiを配置する

### 2-1. Vercelアカウントを作る

1. ブラウザで [Vercel](https://vercel.com/) を開く。
2. `Sign Up` を押す。
3. `Continue with GitHub` を選ぶ。
4. GitHubアカウント `yuhi-riddle` でログインする。
5. Vercelからリポジトリへのアクセス許可を求められたら、`yuhi-riddle/play-sync-planner` を許可する。

### 2-2. Vercelプロジェクトを作る

すでにVercelにMadoiのプロジェクトがある場合は、この節を飛ばして「2-3」へ進みます。

1. Vercelダッシュボードで `Add New...` -> `Project` を押す。
2. `Import Git Repository` の一覧から `yuhi-riddle/play-sync-planner` を探す。
3. 該当行の `Import` を押す。
4. `Project Name` は `play-sync-planner` のままにする。
5. `Framework Preset` が `Next.js` になっていることを確認する。
6. `Root Directory` は空欄のままにする。
7. この時点では環境変数を入れず、画面下の `Deploy` を押す。
8. デプロイ完了画面が出るまで待つ。
9. `Visit` を押して、Vercelの仮URLで画面が表示されることを確認する。ログインやCalendar連携はまだ失敗して構いません。

### 2-3. `madoi.app` をVercelへつなぐ

1. Vercelで `play-sync-planner` プロジェクトを開く。
2. 上部の `Settings` を押す。
3. 左側の `Domains` を押す。
4. 入力欄に `madoi.app` と入力する。
5. `Add` を押す。
6. VercelがDNSレコードを表示したら、画面を閉じずに残しておく。
7. 別のタブでCloudflareを開く。
8. `madoi.app` -> `DNS` -> `Records` を開く。
9. `Add record` を押す。
10. Vercel画面に表示されている内容と同じ種類を選ぶ。
    - `Type` が `A` なら、Cloudflareでも `A` を選ぶ。
    - `Type` が `CNAME` なら、Cloudflareでも `CNAME` を選ぶ。
11. `Name`、`IPv4 address` または `Target`、`TTL` をVercelの表示どおりに入力する。
    - ルートドメインを示す `@` は、そのまま `@` と入力する。
    - Vercelが表示する値は将来変わる可能性があるため、手順書の固定値ではなくVercel画面の値を使う。
12. Cloudflareの `Proxy status` は `DNS only` にする。雲のアイコンが灰色なら正しい。
13. `Save` を押す。
14. Vercelのタブに戻る。
15. `Refresh` または `Verify` を押す。
16. `Valid Configuration` と表示されるまで待つ。DNSの反映には数分から数時間かかることがある。
17. ブラウザで `https://madoi.app` を開く。
18. アドレスバーに鍵アイコンが出て、証明書エラーが出ないことを確認する。

### 2-4. `www.madoi.app` を本番URLへ転送する

1. Vercelの `Settings` -> `Domains` に戻る。
2. 入力欄へ `www.madoi.app` と入力する。
3. `Add` を押す。
4. Vercelに表示されたDNSレコードを確認する。
5. Cloudflareの `madoi.app` -> `DNS` -> `Records` を開く。
6. `Add record` を押す。
7. Vercelの表示どおり、通常は `CNAME` レコードを作る。
8. `Name` に `www`、`Target` にはVercel画面に表示された値を入力する。
9. `Proxy status` は `DNS only` にして `Save` を押す。
10. Vercelで `www.madoi.app` の `Edit` を開く。
11. `Redirect to` で `madoi.app` を選び、保存する。
12. `https://www.madoi.app` を開き、`https://madoi.app` に移動することを確認する。

## 3. Vercelへ本番環境変数を設定する

### 3-1. 値を用意する

`D:\System\projects\play-sync-planner\.env.local` を開きます。ここにすでにある値を、Vercelへコピーします。

> [!WARNING]
> `CALENDAR_TOKEN_ENCRYPTION_KEY` は新しく作り直さず、現在の `.env.local` の値をそのまま使います。この値を変えると、すでに保存済みのGoogle Calendar連携情報を復号できなくなります。

`CRON_SECRET` が空欄の場合だけ、PowerShellで次を実行します。出力された1行を、末尾の `=` も含めて使います。

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

### 3-2. Vercelへ1件ずつ登録する

1. Vercelで `play-sync-planner` を開く。
2. `Settings` -> `Environment Variables` を開く。
3. `Add New` を押す。
4. 次の表の1行目を入力する。
5. `Environments` は `Production` だけにチェックを入れる。`Preview` と `Development` は外す。
6. `Save` を押す。
7. 同じ操作を、表の全行について繰り返す。

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabaseの `Project URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabaseの `anon` または `publishable` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabaseの `service_role` key |
| `NEXT_PUBLIC_SITE_URL` | `https://madoi.app` |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google CloudのOAuth Client ID |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google CloudのOAuth Client Secret |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `https://madoi.app/api/google-calendar/callback` |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | `.env.local` の同名の値 |
| `CRON_SECRET` | `.env.local` の同名の値、または3-1で作った値 |

`SUPABASE_SERVICE_ROLE_KEY`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`CALENDAR_TOKEN_ENCRYPTION_KEY`、`CRON_SECRET` は、絶対に画面共有、Git、チャットへ貼り付けません。

### 3-3. 環境変数を反映する

1. Vercel上部の `Deployments` を開く。
2. 一番上の `main` ブランチのデプロイ行を開く。
3. 右上の `Redeploy` を押す。
4. 確認画面が出たら `Redeploy` を押す。
5. 状態が `Ready` になるまで待つ。
6. `https://madoi.app` を開く。

## 4. Supabase Authを本番URLへ変える

### 4-1. 本番URLを設定する

1. [Supabase Dashboard](https://supabase.com/dashboard) を開く。
2. 現在使っているMadoiのプロジェクトを選ぶ。
3. 左側の `Authentication` を押す。
4. `URL Configuration` を開く。
5. `Site URL` に `https://madoi.app` と入力する。
6. `Redirect URLs` で `Add URL` を押す。
7. `https://madoi.app/**` を入力する。
8. ローカル開発用の `http://localhost:3000/**` は残す。
9. `Save` を押す。

### 4-2. Googleログインを確認する

1. `Authentication` -> `Sign In / Providers` を開く。
2. `Google` を選ぶ。
3. `Enable Sign in with Google` が有効であることを確認する。
4. `Client ID` にGoogle CloudのOAuth Client IDが入っていることを確認する。
5. `Client Secret` にGoogle CloudのOAuth Client Secretが入っていることを確認する。
6. `Save` を押す。

## 5. Google Cloudを設定する

### 5-1. Google Calendar APIを有効にする

1. [Google Cloud Console](https://console.cloud.google.com/) を開く。
2. 画面上部のプロジェクト選択から、MadoiのGoogle Cloudプロジェクトを選ぶ。
3. 左上のメニューを開く。
4. `APIs とサービス` -> `ライブラリ` を押す。
5. 検索欄に `Google Calendar API` と入力する。
6. `Google Calendar API` を開く。
7. `有効にする` を押す。
8. `APIは有効です` と表示されることを確認する。

### 5-2. OAuth ClientのURLを登録する

1. 左側の `Google Auth Platform` -> `クライアント` を開く。
2. 既存のWebアプリケーション用クライアントを開く。
3. `承認済みのJavaScript生成元` で `URIを追加` を押す。
4. `https://madoi.app` を入力する。
5. `http://localhost:3000` が残っていることを確認する。
6. `承認済みのリダイレクトURI` で `URIを追加` を押す。
7. 次の3件を登録する。

```text
https://<SupabaseのProject Ref>.supabase.co/auth/v1/callback
https://madoi.app/api/google-calendar/callback
http://localhost:3000/api/google-calendar/callback
```

8. `保存` を押す。
9. 同じ画面の `クライアントID` をVercelとSupabaseに入れた値と見比べる。
10. `クライアントシークレット` を確認し、VercelとSupabaseへ入れた値と一致していることを確認する。シークレット自体を画面共有しない。

### 5-3. Google Search Consoleで `madoi.app` の所有を確認する

1. [Google Search Console](https://search.google.com/search-console) を開く。
2. Google Cloudで使っているGoogleアカウントでログインする。
3. 左上のプロパティ選択を押す。
4. `プロパティを追加` を押す。
5. 左側の `ドメイン` を選ぶ。
6. 入力欄に `madoi.app` とだけ入力する。`https://` と `www` は入力しない。
7. `続行` を押す。
8. 表示された `TXT` レコードの値をコピーする。
9. Cloudflareで `madoi.app` -> `DNS` -> `Records` を開く。
10. `Add record` を押す。
11. `Type` に `TXT` を選ぶ。
12. `Name` に `@` を入力する。
13. `Content` にSearch Consoleからコピーした値を貼り付ける。
14. `TTL` は `Auto` のままにする。
15. `Save` を押す。
16. Search Consoleのタブへ戻る。
17. `確認` を押す。
18. `所有権が確認されました` と表示されたら完了。

### 5-4. Google Auth Platformのブランド情報を設定する

> [!IMPORTANT]
> Google審査には、ログイン前でも読めるMadoiの説明ページが必要です。現状のトップページはログイン導線が中心なので、公開説明ページを実装してからこの節を実施します。利用規約とプライバシーポリシーだけでは足りません。

公開説明ページの実装後、次の手順で設定します。

1. Google Cloud Consoleで `Google Auth Platform` -> `ブランディング` を開く。
2. `Edit app` または編集ボタンを押す。
3. 次の内容を入力する。

```text
アプリ名: Madoi
ユーザーサポートメール: 問い合わせを受けるメールアドレス
ホームページ: https://madoi.app
プライバシーポリシー: https://madoi.app/privacy
利用規約: https://madoi.app/terms
デベロッパーの連絡先: あなたのメールアドレス
```

4. `承認済みドメイン` に `madoi.app` を追加する。
5. `保存` を押す。

### 5-5. 対象とデータアクセスを公開設定にする

1. `Google Auth Platform` -> `対象` を開く。
2. User Type が `External` になっていることを確認する。
3. `Publish app` を押す。
4. 確認画面で `In production` に変更する。
5. `Test users` は追加しない。
6. `Google Auth Platform` -> `データアクセス` を開く。
7. `スコープを追加または削除` を押す。
8. 次のスコープを検索し、それぞれにチェックを入れる。

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.freebusy
```

9. `更新` または `保存` を押す。
10. 一覧に上の2件が表示されることを確認する。

### 5-6. Google OAuth審査を申請する

1. `Google Auth Platform` -> `検証センター` を開く。
2. `Prepare for verification` を押す。
3. 指示されたブランド情報、連絡先、ドメイン確認の状態を確認する。
4. `calendar.events` の利用目的には、確定したイベントを主催者のGoogle Calendarへ作成し、連携済み参加者へ招待を送るため、と説明する。
5. `calendar.freebusy` の利用目的には、参加者全体の空きやすさを集計して候補日時を比較するため、と説明する。個別の予定名や場所を参加者へ共有しないことも明記する。
6. MadoiでGoogleログイン、Calendar連携、候補日時の空き状況表示、確定予定の作成が確認できる操作動画を英語で録画する。
7. 動画をYouTubeへ `Unlisted` でアップロードする。
8. 求められたら動画URL、`https://madoi.app`、`https://madoi.app/privacy`、`https://madoi.app/terms` を入力する。
9. `Submit` を押す。
10. Google Cloudに登録したサポートメールとデベロッパー連絡先のメールを毎日確認する。追加質問が届いたら、そのメールへ返信する。

## 6. テストデータを削除する

この節は、Google OAuth・Vercel・Supabaseの設定が済み、本番URLでの最終確認を終えた直後にだけ実施します。実行後は元へ戻せません。実際の予定、清算、メッセージが1件でも入っている場合は、ここで止めてください。

### 6-1. 削除前に件数を確認する

1. Supabase DashboardでMadoiプロジェクトを開く。
2. 左側の `SQL Editor` を押す。
3. `New query` を押す。
4. 次のSQLを貼り付ける。
5. `Run` を押す。
6. 表示された件数が、削除してよいテストデータだけであることを確認する。

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

### 6-2. テストデータを削除する

1. 6-1の結果を確認して問題がないことを再確認する。
2. `New query` を押す。
3. 次のSQLを貼り付ける。
4. 実行前に、画面上のプロジェクト名がMadoiの本番プロジェクトであることを確認する。
5. `Run` を押す。
6. 成功表示を確認する。

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

このSQLはアプリのデータだけを削除します。Googleログインのアカウントである `auth.users` は削除しません。自分のアカウントは残し、再ログイン後に利用規約へ同意し直し、Google Calendarを再連携します。

使わないテストアカウントだけを消す場合は、Supabaseの `Authentication` -> `Users` で対象メールアドレスを確認してから、1件ずつ削除します。`auth.users` をSQLでまとめて削除しないでください。

## 7. 本番公開前の最終確認

1. シークレットウィンドウで `https://madoi.app` を開く。
2. Googleログインを押す。
3. 利用規約とプライバシーポリシーの同意画面が表示されることを確認する。
4. 同意してログインする。
5. イベントを1件作る。
6. 参加者を招待する。
7. 候補日時を追加する。
8. Google Calendarを連携する。
9. 候補日時画面で空き状況が表示されることを確認する。
10. 日程を確定する。
11. `Calendarに作成して招待` を実行し、自分のGoogle Calendarに予定が作られることを確認する。
12. `https://www.madoi.app` を開き、`https://madoi.app` へ移動することを確認する。
13. Vercelの `Deployments` で、最新の `main` ブランチが `Ready` になっていることを確認する。

## 8. 本番公開後の運用

- 本番データをまとめて削除しない。
- 動作確認用の予定を作る場合は、予定名の先頭に `テスト:` を付ける。
- 問い合わせを受けたら、画面、操作手順、発生日時、エラー文をセットで残してもらう。
- Google OAuth審査が終わるまでは、Calendar連携に警告が出ることを利用者へ説明する。
- Googleから審査に関するメールが届いたら、内容をそのまま共有する。回答文と必要な修正は一緒に整理する。
