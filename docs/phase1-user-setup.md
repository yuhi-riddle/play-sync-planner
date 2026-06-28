# Madoi Phase 1 セットアップ手順

この手順は、Phase 1 を自分のSupabase環境で動かすためのものです。

## 1. 必要なもの

- Node.js
- Supabaseアカウント
- Googleアカウント

追加のCodexプラグインは不要です。

## 2. Supabaseプロジェクトを作る

1. Supabaseにログインします。
2. `New project` を押します。
3. Project name に `play-sync-planner` など分かりやすい名前を入れます。
4. Database Password を控えます。
5. Region は近い場所を選びます。
6. `Create new project` を押します。

## 3. DBテーブルを作る

1. Supabaseの左メニューで `SQL Editor` を開きます。
2. `New query` を押します。
3. このリポジトリの `supabase/migrations/001_phase1_schema.sql` を開きます。
4. 中身を全部コピーして、SupabaseのSQL Editorに貼り付けます。
5. `Run` を押します。

エラーが出たら、エラー文をそのままCodexに貼ってください。

## 4. APIキーを確認する

1. Supabaseの左下にある `Project Settings` を開きます。
2. `API` を開きます。
3. 以下を控えます。

```text
Project URL
anon public key
service_role key
```

`service_role key` は強い権限を持つキーです。GitHubなどに公開しないでください。

## 5. .env.local を作る

1. プロジェクト直下に `.env.local` を作ります。
2. 次の形で値を入れます。

```text
NEXT_PUBLIC_SUPABASE_URL=SupabaseのProject URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=Supabaseのanon public key
SUPABASE_SERVICE_ROLE_KEY=Supabaseのservice_role key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 6. Googleログインを設定する

まずは画面確認だけなら、この手順は後回しでも大丈夫です。

Googleログインまで使う場合は、先にGoogle Cloud ConsoleでOAuth Clientを作り、そのあとSupabaseのGoogle Providerに値を入れて有効化します。

### 6-1. Supabase側でCallback URLを控える

1. Supabaseの対象プロジェクトを開きます。
2. 左メニューで `Authentication` を開きます。
3. `Sign In / Providers` または `Providers` を開きます。
4. 一覧から `Google` を開きます。
5. `Callback URL` または `Redirect URL` と表示されているURLをコピーします。

URLはだいたい次の形です。

```text
https://<project-id>.supabase.co/auth/v1/callback
```

このURLは、あとでGoogle Cloud側の `Authorized redirect URIs` に入れます。

### 6-2. Google Cloud Consoleでプロジェクトを選ぶ

1. ブラウザで Google Cloud Console を開きます。
2. 画面上部のプロジェクト選択メニューを押します。
3. 既に使うプロジェクトがあれば選びます。
4. なければ `New Project` または `新しいプロジェクト` を押します。
5. Project name に `play-sync-planner` などを入れます。
6. `Create` を押します。
7. 作成したプロジェクトが画面上部で選択されていることを確認します。

### 6-3. OAuth同意画面を準備する

OAuth Clientを作る前に、Google側でアプリ名などを登録します。

1. Google Cloud Consoleの検索欄で `OAuth consent screen` または `OAuth 同意画面` を検索します。
2. `OAuth consent screen` を開きます。
3. User Type を聞かれたら、個人開発ならまず `External` を選びます。
4. `Create` を押します。
5. App name に `Madoi` と入力します。
6. User support email に自分のGoogleアカウントを選びます。
7. Developer contact information の Email addresses に自分のメールアドレスを入れます。
8. `Save and Continue` を押します。
9. Scopes画面では、まず何も追加せず `Save and Continue` を押します。
10. Test users画面が出たら、ログインに使う自分のGoogleアカウントを追加します。
11. `Save and Continue` を押します。
12. Summary画面で内容を確認して完了します。

最初は公開申請しなくて大丈夫です。テストユーザーに自分を入れて、開発中のログイン確認に使います。

### 6-4. OAuth Clientを作る

1. Google Cloud Consoleの検索欄で `Clients` または `認証情報` を検索します。
2. `APIs & Services > Credentials` または `Google Auth Platform > Clients` を開きます。
3. `Create Credentials` または `Create Client` を押します。
4. 種類を聞かれたら `OAuth client ID` を選びます。
5. Application type は `Web application` を選びます。
6. Name には `Madoi local` など分かりやすい名前を入れます。
7. `Authorized JavaScript origins` の `Add URI` を押します。
8. 次を入力します。

```text
http://localhost:3000
```

9. `Authorized redirect URIs` の `Add URI` を押します。
10. 6-1で控えたSupabaseのCallback URLを入力します。

```text
https://<project-id>.supabase.co/auth/v1/callback
```

11. `Create` を押します。
12. 作成後に表示される `Client ID` と `Client secret` を控えます。

`Client ID` は次のような形です。

```text
xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

`Client secret` は次のような形です。

```text
GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx
```

### 6-5. SupabaseにClient IDとClient Secretを入れる

1. Supabaseに戻ります。
2. `Authentication > Providers > Google` を開きます。
3. `Google Client IDs` に、Google Cloudで作った `Client ID` を入れます。
4. `Google Client Secret` に、Google Cloudで作った `Client secret` を入れます。
5. Google Providerを有効にします。
6. `Save` を押します。

`Google Client IDs` には、複数のClient IDをカンマ区切りで入れられます。今回は1つだけでOKです。

入れる値を間違えやすいので、対応表を確認してください。

| 入力欄 | 入れるもの | 例 |
|---|---|---|
| Google Client IDs | Google CloudのClient ID | `xxxx.apps.googleusercontent.com` |
| Google Client Secret | Google CloudのClient secret | `GOCSPX-...` |
| Google側のAuthorized JavaScript origins | ローカルアプリのURL | `http://localhost:3000` |
| Google側のAuthorized redirect URIs | SupabaseのCallback URL | `https://<project-id>.supabase.co/auth/v1/callback` |

### 6-6. よくあるエラー

#### Invalid characters. Google Client IDs should be a comma-separated list of domain-like strings.

`Google Client IDs` にClient ID以外を入れています。

NG例：

```text
https://<project-id>.supabase.co
https://<project-id>.supabase.co/auth/v1/callback
GOCSPX-xxxxxxxx
```

OK例：

```text
xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
```

#### redirect_uri_mismatch

Google Cloud側の `Authorized redirect URIs` と、実際に使われたCallback URLが一致していません。

確認すること：

1. SupabaseのGoogle Provider画面に表示されているCallback URLをコピーし直します。
2. Google CloudのOAuth Client編集画面を開きます。
3. `Authorized redirect URIs` に同じURLが入っているか確認します。
4. 末尾の `/` の有無も含めて、完全一致させます。

ここは少しつまずきやすいので、画面やエラーを見ながら一緒に進めるのがおすすめです。

## 7. アプリを起動する

PowerShellでプロジェクトフォルダを開いて、次を実行します。

```powershell
npm.cmd install
npm.cmd run dev
```

ブラウザで開きます。

```text
http://localhost:3000
```

## 8. 動作確認の流れ

1. `/login` からログインします。
2. `/events/new` で予定を作ります。
3. 予定管理画面から日程調整を作ります。
4. 候補日時と回答期限を入力します。
5. 日程調整詳細に表示された共有リンクを開きます。
6. 未ログイン状態で名前と候補日時ごとの回答を入れます。
7. `/plans/:planId/confirm` で候補日を1つ選んで確定します。

## 9. Codexに貼るとよい情報

うまく動かないときは、以下を貼ってください。

```text
どの手順で止まったか:
表示されたエラー:
実行したコマンド:
開いていたURL:
```

スクリーンショットがある場合は、それもあると早いです。
