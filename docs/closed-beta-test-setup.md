# Madoi 公開テスト準備

少人数の外部テスターに公開するための手順です。本番利用前のクローズドテストとして、テスト用のSupabaseプロジェクトと固定のVercel URLを使います。

## 1. テスト用Supabaseプロジェクトを作る

1. [Supabase Dashboard](https://supabase.com/dashboard) を開く。
2. `New project` を選ぶ。
3. プロジェクト名を `madoi-beta` などにし、リージョンは東京を選ぶ。
4. 作成後、`SQL Editor` を開く。
5. `supabase/migrations` の `001` から `018` をファイル名順に、1ファイルずつ実行する。

`016` は既存の `set_updated_at()` 関数を使うため、必ず前のマイグレーションから順に実行します。

## 2. Vercelへ配置する

1. [Vercel](https://vercel.com/new) を開く。
2. GitHub の `yuhi-riddle/play-sync-planner` をImportする。
3. プロジェクトを作成する。
4. 初回デプロイ後に表示される `https://...vercel.app` を控える。このURLを公開テスト用の固定URLとして使う。

## 3. Vercelの環境変数を設定する

Vercelプロジェクトの `Settings` -> `Environment Variables` で、次を `Production` と `Preview` に登録します。

```text
NEXT_PUBLIC_SUPABASE_URL=<テスト用Supabase Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<テスト用Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<テスト用Supabase service_role key>
NEXT_PUBLIC_SITE_URL=https://<Vercelの公開テストURL>
GOOGLE_CALENDAR_CLIENT_ID=<Google OAuth Client ID>
GOOGLE_CALENDAR_CLIENT_SECRET=<Google OAuth Client Secret>
GOOGLE_CALENDAR_REDIRECT_URI=https://<Vercelの公開テストURL>/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=<32バイト以上のランダムな鍵>
CRON_SECRET=<十分に長いランダム文字列>
```

`SUPABASE_SERVICE_ROLE_KEY`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`CALENDAR_TOKEN_ENCRYPTION_KEY`、`CRON_SECRET` はブラウザに出してはいけません。環境変数を変更した後は、Vercelで再デプロイします。

## 4. Supabase Authを設定する

Supabase の `Authentication` -> `URL Configuration` を開き、以下を設定します。

```text
Site URL
https://<Vercelの公開テストURL>

Redirect URLs
https://<Vercelの公開テストURL>/**
http://localhost:3000/**
```

続けて `Authentication` -> `Sign In / Providers` -> `Google` でGoogleログインを有効にし、Google OAuth Client IDとSecretを登録します。

## 5. Google OAuthを設定する

Google Cloud ConsoleのOAuth Clientで、以下を登録します。

```text
承認済みのJavaScript生成元
https://<Vercelの公開テストURL>
http://localhost:3000

承認済みのリダイレクトURI
https://<テスト用SupabaseのProject Ref>.supabase.co/auth/v1/callback
https://<Vercelの公開テストURL>/api/google-calendar/callback
http://localhost:3000/api/google-calendar/callback
```

Google Auth Platform の `対象` で、テスト参加者のGoogleメールアドレスを `Test users` に追加します。Testing状態では、登録済みの最大100人だけが利用でき、Google Calendarの同意は7日後に取り直しになります。

## 6. 公開前の確認

主催者、招待される人、Google Calendar未連携の人の3役で確認します。

1. 利用規約とプライバシーポリシーへ同意してGoogleログインできる。
2. イベント作成と下書き保存、下書き破棄ができる。
3. 共有リンクから参加できる。
4. アプリ内招待を承諾・辞退できる。
5. つながり、フォロー、お気に入り、ブロックが動く。
6. Google Calendarを連携し、候補日時作成で参加者全体の空きやすさを表示できる。
7. 日程確定、Calendarへの登録、清算、イベント内チャットを確認する。

## 7. テスト中の運用

- テスターの報告先を1つに決め、画面、操作手順、発生日時、エラー文を残してもらう。
- テスト用データは定期的に削除する。外部テスターの実際の支払い情報は入れない。
- 広く公開する前に、Google OAuthの公開設定と必要な審査を検討する。
