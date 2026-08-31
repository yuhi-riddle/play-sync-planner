# Madoi Phase 2 Google Calendar セットアップ手順

この手順は、自分の Google Calendar の予定を見ながら候補日時を決め、日程確定後にGoogle Calendarへ予定を作るための設定です。Google Calendar 連携は任意です。

Madoi が扱う Google Calendar 情報は次の範囲です。

- 候補日時作成時: 予定の開始・終了時刻、予定名、場所を取得します。
- 日程確定後: 主催者のGoogle Calendarに予定を作成できます。Google Calendar連携済みの参加者がいれば、カレンダー招待も送ります。
- 取得しない情報: 予定の説明、参加者、Meet URL、添付ファイル。
- 保存しない情報: Google Calendar 上の予定名や場所などの予定詳細。

## 1. Google Cloud Console を開く

1. [Google Cloud Console](https://console.cloud.google.com/) を開きます。
2. 画面上部のプロジェクト選択から、Madoi 用のプロジェクトを選びます。
3. まだプロジェクトがない場合は、`play-sync-planner` などの名前で作成します。

## 2. Google Auth Platform を設定する

1. 左上のメニューを開きます。
2. `Google Auth Platform` を開きます。
3. 初回の場合は `開始` を押します。
4. アプリ名には `Madoi` を入力します。
5. ユーザーサポートメールには、自分のメールアドレスを選びます。
6. 対象は `外部` を選びます。
7. `Publish app` を押して `In production` にします。テストユーザーは追加しません。

独自ドメインなしの無料公開では、Google Calendar連携に未確認アプリの警告が出ることがあり、新規連携ユーザーは合計100人までです。

## 3. OAuth Client を作成する

1. `Google Auth Platform > クライアント` を開きます。
2. `クライアントを作成` を押します。
3. アプリケーションの種類は `ウェブ アプリケーション` を選びます。
4. 名前は `Madoi local` などにします。
5. `承認済みの JavaScript 生成元` に次を追加します。

```text
http://localhost:3000
```

6. `承認済みのリダイレクト URI` に次を追加します。

```text
http://localhost:3000/api/google-calendar/callback
```

7. Supabase の Google ログインも同じ OAuth Client を使っている場合は、次の URI も残します。

```text
https://esheopszeqggftmawdmu.supabase.co/auth/v1/callback
```

8. 作成後に表示される `クライアント ID` と `クライアント シークレット` を控えます。

## 4. Calendar API のスコープを追加する

1. `Google Auth Platform > データアクセス` を開きます。
2. `スコープを追加または削除` を押します。
3. 次のスコープを追加します。

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.freebusy
openid
email
```

`openid` / `email` は、どの Google アカウントで連携したかを保存・表示するために使います
（連携先メールアドレスを id_token から取得）。予定の中身は取得しません。

以前追加していた次のスコープは不要です。可能なら削除してください。

```text
https://www.googleapis.com/auth/calendar.events.readonly
```

スコープを変えた後は、Madoi の設定画面で Google Calendar を一度解除し、もう一度連携してください。古い連携トークンには新しい権限が含まれていません。

## 5. .env.local を更新する

`.env.local` に次を追加します。

```text
GOOGLE_CALENDAR_CLIENT_ID=Google Cloud のクライアント ID
GOOGLE_CALENDAR_CLIENT_SECRET=Google Cloud のクライアント シークレット
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=32バイトのbase64文字列
```

`CALENDAR_TOKEN_ENCRYPTION_KEY` は PowerShell で作れます。

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

表示された文字列を、末尾の `=` も含めて `CALENDAR_TOKEN_ENCRYPTION_KEY` に入れます。

## 6. Supabase にマイグレーションを適用する

Supabase Dashboard の SQL Editor を開き、次のファイルの中身を実行します。

```text
supabase/migrations/002_calendar_integrations.sql
supabase/migrations/003_plan_reminder_settings.sql
supabase/migrations/004_plan_reminder_logs.sql
```

`001_phase1_schema.sql` をまだ実行していない場合は、先に `001_phase1_schema.sql` を実行してください。

## 7. 動作確認

1. 開発サーバーを起動します。

```powershell
npm.cmd run dev
```

2. ブラウザで `http://localhost:3000/settings` を開きます。
3. `Google Calendarを連携` を押します。
4. Google の認可画面で許可します。
5. `/settings?calendar=connected` に戻れば連携完了です。
6. 候補日時の入力画面で、Google Calendar の予定名と場所が表示されることを確認します。
7. 日程を確定し、予定詳細の `Calendarに作成して招待` からGoogle Calendarに予定を作れることを確認します。
8. 参加者がGoogle Calendar連携済みの場合、作成した予定の参加者にメールアドレスが入ることを確認します。

うまくいかない場合は、表示されているURL、エラーメッセージ、どの手順で止まったかを共有してください。
