# Madoi Phase 2-A Google Calendar セットアップ手順

この手順は、自分の Google Calendar の予定あり時間帯を、候補日時作成画面で確認するための設定です。

Phase 2-A では、予定名、場所、説明、参加者は取得しません。取得するのは「この時間帯は予定あり」という開始・終了時刻だけです。

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
6. 対象は、まず `外部` で進めます。
7. テストユーザーに、自分の Google アカウントを追加します。

## 3. OAuth Client を作成する

1. `Google Auth Platform > クライアント` を開きます。
2. `クライアントを作成` を押します。
3. アプリケーションの種類は `ウェブ アプリケーション` を選びます。
4. 名前は `Madoi local` などにします。
5. `承認済みのリダイレクト URI` に次を追加します。

```text
http://localhost:3000/api/google-calendar/callback
```

6. 作成後に表示される `クライアント ID` と `クライアント シークレット` を控えます。

## 4. Calendar API のスコープを追加する

1. `Google Auth Platform > データアクセス` を開きます。
2. `スコープを追加または削除` を押します。
3. 次のスコープを追加します。

```text
https://www.googleapis.com/auth/calendar.freebusy
```

このスコープが選べない、または Google 側でエラーになる場合は、作業を止めて Codex に画面やエラー内容を共有してください。別スコープへ広げる判断が必要です。

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
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

表示された文字列を `CALENDAR_TOKEN_ENCRYPTION_KEY` に入れます。

## 6. Supabase にマイグレーションを適用する

Supabase Dashboard の SQL Editor を開き、次のファイルの中身を実行します。

```text
supabase/migrations/002_calendar_integrations.sql
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
6. イベント詳細から `参加予定を作成` に進みます。
7. 候補日時の入力画面で、Google Calendar の予定あり時間帯が表示されることを確認します。

うまくいかない場合は、表示されたURL、エラーメッセージ、どの手順で止まったかを共有してください。
