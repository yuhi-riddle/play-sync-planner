# Madoi 無料公開手順

この手順では、ドメインを購入せず、VercelとSupabaseの無料プランでMadoiを公開します。公開が終われば、PCを閉じていても使えます。

本番URLは、Vercelが発行する `https://<プロジェクト名>.vercel.app` です。以下では `Vercel本番URL` と書きます。実際の値は手順2でVercel画面からコピーします。

## 0. 無料公開の範囲

- 広告、課金、アフィリエイトリンクは置かない。Vercel Hobbyは個人・非商用利用の無料プランです。
- Googleログインは誰でも使える設定にする。テストユーザーは追加しない。
- Google Calendar連携には未確認アプリの警告が出ることがある。新規連携ユーザーは合計100人までです。
- 定期通知は、Vercel Hobbyの制限により1日1回です。日程回答を送った直後の通知はすぐ作られます。
- Supabase無料プロジェクトは、1週間ほとんど使われないと一時停止することがあります。停止してもDashboardから再開できます。

## 1. Vercelへログインする

1. ブラウザで [Vercel](https://vercel.com/) を開く。
2. 右上の `Sign Up` を押す。
3. `Continue with GitHub` を押す。
4. GitHubアカウント `yuhi-riddle` でログインする。
5. GitHub連携の確認画面が出たら、`Authorize Vercel` を押す。
6. リポジトリの選択画面が出たら、`yuhi-riddle/play-sync-planner` を許可する。

## 2. MadoiをVercelへ公開する

### 2-1. プロジェクトを作る

すでにVercelに `play-sync-planner` プロジェクトがある場合は、「2-2」へ進みます。

1. Vercelダッシュボードで `Add New...` を押す。
2. `Project` を選ぶ。
3. `Import Git Repository` の一覧で `yuhi-riddle/play-sync-planner` を探す。
4. 右側の `Import` を押す。
5. `Project Name` が `play-sync-planner` であることを確認する。
6. `Framework Preset` が `Next.js` であることを確認する。
7. `Root Directory` は空欄のままにする。
8. まだ `Deploy` は押さない。環境変数を先に設定する必要がある。
9. `Project Name` が `play-sync-planner` の場合、`NEXT_PUBLIC_SITE_URL` には `https://play-sync-planner.vercel.app` を使う。
10. 先に「3. Vercelの環境変数を設定する」の全手順を実施する。
11. 環境変数を保存したあと、この画面へ戻り、画面下の `Deploy` を押す。
12. デプロイ完了画面が表示されるまで待つ。
13. `Visit` を押す。

### 2-2. Vercel本番URLをコピーする

1. Vercelで `play-sync-planner` プロジェクトを開く。初回デプロイに失敗していても、プロジェクトは作成済みなので続けられる。
2. `Overview` を開く。
3. `Domains` または `Production Deployment` に表示される `https://...vercel.app` を探す。
4. 表示されたURLのコピーアイコンを押す。
5. メモ帳を開き、貼り付ける。
6. 以後の手順で `Vercel本番URL` と書かれた場所には、このURLを使う。

## 3. Vercelの環境変数を設定する

### 3-1. `.env.local` から値を確認する

1. エクスプローラーで `D:\System\projects\play-sync-planner` を開く。
2. `.env.local` を右クリックし、使っているエディタで開く。
3. 次の7項目があることを確認する。

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GOOGLE_CALENDAR_CLIENT_ID
GOOGLE_CALENDAR_CLIENT_SECRET
CALENDAR_TOKEN_ENCRYPTION_KEY
CRON_SECRET
```

4. `CALENDAR_TOKEN_ENCRYPTION_KEY` は作り直さない。値を変えると、すでに保存済みのGoogle Calendar連携情報を読めなくなります。
5. `CRON_SECRET` が空欄の場合だけ、PowerShellで次を実行する。出力された1行は、最後の `=` まで含めて使います。

```powershell
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
$rng.Dispose()
```

### 3-2. Vercelへ1件ずつ登録する

1. Vercelで `play-sync-planner` プロジェクトを開く。
2. 上部の `Settings` を押す。
3. 左側の `Environment Variables` を押す。
4. `Add New` を押す。
5. 下の表の1行目の `Name` と `Value` を入力する。
6. `Environments` は `Production` だけにチェックを入れる。
7. `Preview` と `Development` にチェックが入っていたら外す。
8. `Save` を押す。
9. 表の全行について、4から8を繰り返す。

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` の同名の値 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` の同名の値 |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` の同名の値 |
| `NEXT_PUBLIC_SITE_URL` | Vercel本番URL |
| `GOOGLE_CALENDAR_CLIENT_ID` | `.env.local` の同名の値 |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | `.env.local` の同名の値 |
| `GOOGLE_CALENDAR_REDIRECT_URI` | `Vercel本番URL/api/google-calendar/callback` |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | `.env.local` の同名の値 |
| `CRON_SECRET` | `.env.local` の同名の値、または3-1で作った値 |

`SUPABASE_SERVICE_ROLE_KEY`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`CALENDAR_TOKEN_ENCRYPTION_KEY`、`CRON_SECRET` は、画面共有、Git、チャットに貼り付けません。

### 3-3. 環境変数を反映する

1. 上部の `Deployments` を押す。
2. 一番上の `main` ブランチのデプロイを開く。
3. 右上の `Redeploy` を押す。
4. 確認画面が出たら、再度 `Redeploy` を押す。
5. 状態が `Ready` になるまで待つ。
6. Vercel本番URLを開く。

## 4. Supabase Authを設定する

1. [Supabase Dashboard](https://supabase.com/dashboard) を開く。
2. MadoiのSupabaseプロジェクトを選ぶ。
3. 左側の `Authentication` を押す。
4. `URL Configuration` を開く。
5. `Site URL` にVercel本番URLを貼り付ける。
6. `Redirect URLs` の `Add URL` を押す。
7. `Vercel本番URL/**` を入力する。
8. `http://localhost:3000/**` が残っていることを確認する。
9. `Save` を押す。
10. `Authentication` -> `Sign In / Providers` -> `Google` を開く。
11. Googleログインが有効であることを確認する。
12. Google Cloudの `Client ID` と `Client Secret` が入っていることを確認する。
13. `Save` を押す。

## 5. Google Cloudを設定する

### 5-1. Calendar APIを有効にする

1. [Google Cloud Console](https://console.cloud.google.com/) を開く。
2. 画面上部のプロジェクト選択から、Madoiのプロジェクトを選ぶ。
3. 左上のメニューを開く。
4. `APIs とサービス` -> `ライブラリ` を押す。
5. 検索欄に `Google Calendar API` と入力する。
6. `Google Calendar API` を開く。
7. `有効にする` が表示されていれば押す。`管理` が表示されていれば、すでに有効です。

### 5-2. OAuth ClientへVercel本番URLを追加する

1. `Google Auth Platform` -> `クライアント` を開く。
2. Madoi用のWebアプリケーションOAuth Clientを開く。
3. `承認済みのJavaScript生成元` で `URIを追加` を押す。
4. Vercel本番URLを貼り付ける。
5. `http://localhost:3000` が残っていることを確認する。
6. `承認済みのリダイレクトURI` で `URIを追加` を押す。
7. 次の3件を登録する。

```text
https://<SupabaseのProject Ref>.supabase.co/auth/v1/callback
Vercel本番URL/api/google-calendar/callback
http://localhost:3000/api/google-calendar/callback
```

8. `保存` を押す。

`SupabaseのProject Ref` は、Supabase DashboardのURLにある `https://supabase.com/dashboard/project/` の後ろの文字列です。

### 5-3. 誰でもGoogleログインできるようにする

1. `Google Auth Platform` -> `対象` を開く。
2. User Type が `External` であることを確認する。
3. `Publish app` を押す。
4. 確認画面で `In production` を選ぶ。
5. `Test users` は追加しない。
6. `Google Auth Platform` -> `データアクセス` を開く。
7. `スコープを追加または削除` を押す。
8. 次の2件を検索し、チェックを入れる。

```text
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.freebusy
```

9. `更新` または `保存` を押す。

独自ドメインがないため、Google OAuth審査はここでは申請しません。Google Calendar連携時の警告と100人上限は、この無料公開の制限として受け入れます。

## 6. 無料プランでの通知

無料のVercel Hobbyは、定期処理を1日1回までに制限しています。このリポジトリでは、毎日 `00:00 UTC`、日本時間では午前9時台に通知を生成します。

- 日程回答を送った直後の主催者向け通知はすぐ作られる
- 未回答、清算、支払い待ち、回答期限の定期確認は1日1回まとめて行う
- 回答期限の数分前に必ず通知する仕組みではない

## 7. テストデータを削除する

Vercel本番URLでの動作確認が終わり、現在のデータがすべてテストデータだと確認できた場合だけ実行します。削除前の確認SQLと削除SQLは [独自ドメイン・OAuth審査手順の「6. テストデータを削除する」](./closed-beta-test-setup.md#6-テストデータを削除する) を使います。

`auth.users` は削除しません。使わないテストアカウントだけを削除する場合は、Supabaseの `Authentication` -> `Users` から1件ずつ行います。

## 8. PCを閉じたあとに確認する

1. Vercel本番URLをスマートフォン、またはPCのシークレットウィンドウで開く。
2. Googleログインできることを確認する。
3. PCをスリープまたはシャットダウンする。
4. スマートフォンのモバイル回線でVercel本番URLを開く。
5. イベント一覧が表示されれば、PCを閉じていてもMadoiは動いています。

VercelとSupabaseはクラウド上で動くため、あなたのPCはサーバーではありません。PCを閉じてもMadoiは使えます。

## 9. Supabaseが一時停止したときの再開手順

1. Supabaseから一時停止のメールが届いたら開く。
2. [Supabase Dashboard](https://supabase.com/dashboard) を開く。
3. Madoiのプロジェクトを選ぶ。
4. `Resume project` を押す。
5. 確認画面で再開する。
6. Vercel本番URLを開き、ログインできることを確認する。

## 10. 独自ドメインへ移行する時期

次のどちらかになった時点で、`madoi.app` の購入と [独自ドメイン・OAuth審査手順](./closed-beta-test-setup.md) へ進みます。

- Google Calendar連携の新規ユーザーが100人に近づいた
- 未確認アプリの警告を出さずに公開したくなった

広告を載せる場合は、Vercel Hobbyを使えません。寄付だけであれば、Vercelの無料枠の範囲で運用できます。
