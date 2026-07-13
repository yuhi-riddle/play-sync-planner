# Madoi 公開テスト準備

誰でもGoogleログインできる公開テストの手順です。Google Calendar連携まで人数制限なく使える状態を目指すため、テスト用のSupabaseプロジェクト、独自ドメイン、固定のVercel URLを使います。

## 最初に決めること

Google OAuthには次の2段階があります。

- **公開設定のみ**: Googleログインは誰でも使える。ただし未審査のCalendar権限には警告が出て、Calendar連携の新規ユーザー数は100人で止まる。
- **審査完了後**: GoogleログインとCalendar連携を、警告や新規ユーザー上限なしで公開できる。

MadoiはGoogle Calendarの予定作成と空き状況確認を扱うため、公開テストを広く募る前にGoogle審査まで進める方針にします。

## 1. テスト用Supabaseプロジェクトを作る

1. [Supabase Dashboard](https://supabase.com/dashboard) を開く。
2. `New project` を選ぶ。
3. プロジェクト名を `madoi-beta` などにし、リージョンは東京を選ぶ。
4. 作成後、`SQL Editor` を開く。
5. `supabase/migrations` の `001` から `018` をファイル名順に、1ファイルずつ実行する。

`016` は既存の `set_updated_at()` 関数を使うため、必ず前のマイグレーションから順に実行します。

## 2. 独自ドメインを用意する

Google OAuthの審査では、ホームページ、利用規約、プライバシーポリシーを自分で所有・確認できるドメインに置く必要があります。`vercel.app` の共有ドメインだけでは審査を進められません。

1. 利用する独自ドメインを決める。すでに持っているドメインがあればそれで構いません。
2. 公開テスト用に `beta.<あなたのドメイン>` のようなサブドメインを使う。
3. ドメイン管理画面へ入れるGoogleアカウントを、Google Cloudプロジェクトのオーナーまたは編集者にする。

## 3. Vercelへ配置する

1. [Vercel](https://vercel.com/new) を開く。
2. GitHub の `yuhi-riddle/play-sync-planner` をImportする。
3. プロジェクトを作成する。
4. `Settings` -> `Domains` を開き、`beta.<あなたのドメイン>` を追加する。
5. Vercelに表示されたDNSレコードを、ドメイン管理会社のDNS設定へそのまま登録する。
6. Vercelでドメインの状態が `Valid Configuration` になったことを確認する。
7. 以後、`https://beta.<あなたのドメイン>` を公開テストURLとして使う。

## 4. Vercelの環境変数を設定する

Vercelプロジェクトの `Settings` -> `Environment Variables` で、次を `Production` と `Preview` に登録します。

```text
NEXT_PUBLIC_SUPABASE_URL=<テスト用Supabase Project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<テスト用Supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<テスト用Supabase service_role key>
NEXT_PUBLIC_SITE_URL=https://beta.<あなたのドメイン>
GOOGLE_CALENDAR_CLIENT_ID=<Google OAuth Client ID>
GOOGLE_CALENDAR_CLIENT_SECRET=<Google OAuth Client Secret>
GOOGLE_CALENDAR_REDIRECT_URI=https://beta.<あなたのドメイン>/api/google-calendar/callback
CALENDAR_TOKEN_ENCRYPTION_KEY=<32バイト以上のランダムな鍵>
CRON_SECRET=<十分に長いランダム文字列>
```

`SUPABASE_SERVICE_ROLE_KEY`、`GOOGLE_CALENDAR_CLIENT_SECRET`、`CALENDAR_TOKEN_ENCRYPTION_KEY`、`CRON_SECRET` はブラウザに出してはいけません。環境変数を変更した後は、Vercelで再デプロイします。

## 5. Supabase Authを設定する

Supabase の `Authentication` -> `URL Configuration` を開き、以下を設定します。

```text
Site URL
https://beta.<あなたのドメイン>

Redirect URLs
https://beta.<あなたのドメイン>/**
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
ホームページ: https://beta.<あなたのドメイン>
プライバシーポリシー: https://beta.<あなたのドメイン>/privacy
利用規約: https://beta.<あなたのドメイン>/terms
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
https://beta.<あなたのドメイン>
http://localhost:3000

承認済みのリダイレクトURI
https://<テスト用SupabaseのProject Ref>.supabase.co/auth/v1/callback
https://beta.<あなたのドメイン>/api/google-calendar/callback
http://localhost:3000/api/google-calendar/callback
```

### 6-5. Google審査を申請する

1. `Google Auth Platform` -> `検証センター` を開く。
2. `Prepare for verification` を選ぶ。
3. 各Calendar権限について、Madoiが日程候補の重なり確認と確定予定の作成・招待に使うことを説明する。
4. 英語で、Googleログイン、Calendar連携、候補日時の空き状況表示、確定予定の作成が分かる操作動画を作る。YouTubeへ `Unlisted` でアップロードする。
5. 動画URL、公開URL、プライバシーポリシーURL、利用規約URLを入力して申請する。

審査が終わる前でも誰でもGoogleログインはできます。ただしCalendar連携には「未確認アプリ」の警告が出て、100人の新規ユーザー上限があります。広く募集するのは、審査が通ってからにします。

## 7. 公開前の確認

主催者、招待される人、Google Calendar未連携の人の3役で確認します。

1. 利用規約とプライバシーポリシーへ同意してGoogleログインできる。
2. イベント作成と下書き保存、下書き破棄ができる。
3. 共有リンクから参加できる。
4. アプリ内招待を承諾・辞退できる。
5. つながり、フォロー、お気に入り、ブロックが動く。
6. Google Calendarを連携し、候補日時作成で参加者全体の空きやすさを表示できる。
7. 日程確定、Calendarへの登録、清算、イベント内チャットを確認する。

## 8. テスト中の運用

- テスターの報告先を1つに決め、画面、操作手順、発生日時、エラー文を残してもらう。
- テスト用データは定期的に削除する。外部テスターの実際の支払い情報は入れない。
- 広く公開する前に、Google OAuthの公開設定と必要な審査を検討する。
