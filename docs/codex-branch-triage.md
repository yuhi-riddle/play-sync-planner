# `wip/legacy-helper-test` の棚卸し

2026-08-12 実施。112ファイル / +14,489行 / 30コミットの中身を、main の現状と突き合わせた結果。

対象ブランチは `wip/legacy-helper-test`。`codex/performance-security-foundation` はその親コミットなので、
見るのはこちらだけでよい。両方ともリモートにバックアップ済み。

このブランチは 2026-07-19 に書かれたもので、**フォルダ整理の前**の構成（`lib/actions/answers.ts`、
`components/event-chat.tsx` など）を持つ。取り込むときは全ファイルでパスの読み替えが要る。

## 結論

12タスクのうち **2つは main に取り込み済み**、**1つは前提が消えて不要**、残り9つが未取り込み。
最大の塊はレート制限と監査ログ（migration 023、2,085行）。

## タスクごとの状態

| # | 内容 | 状態 |
|---|---|---|
| 1 | 現状値と管理権限の利用箇所を固定する | **作り直し**。migration 030 で service role の使い所が激変したので、当時の棚卸しは使えない |
| 2 | 保護関数の匿名実行を止める（021） | 未取り込み。**要修正**（下記）。実測で穴が確認された |
| 3 | DB権限を実環境で検証するスクリプト | ✅ 取り込み済み（2026-08-12） |
| 4 | 用途別RPCと索引（022） | **一部済み**。イベント一覧は 020/029 で実現済み。つながり・予定・招待候補が残り |
| 5 | つながりを分類別20件のカーソル取得へ | 未取り込み |
| 6 | カレンダー取得を表示月だけに | 未取り込み（`timeMin` の絞りは一部入っている） |
| 7 | イベント詳細を概要・チャット・招待候補へ分離 | 未取り込み。main に `Suspense` は無い |
| 8 | 共通ガード・回数制限・監査ログ（023） | 未取り込み。**このブランチ最大の塊** |
| 9 | CSP・主要ヘッダー・Cron認証 | ✅ **取り込み済み**。main の `middleware.ts` はこの版より進んでいる |
| 10 | Web Vitals とサーバー時間の記録（024） | **半分済み**。計測と送信は main にある。保存だけ無い |
| 11 | 大量データと3秒基準の自動検証 | 未取り込み |
| 12 | 旧補助関数への依存をなくす | 未取り込み。1〜11 が前提 |

### 9 が済んでいる根拠

main の `middleware.ts`（211行）は、ブランチ版（209行）に対して

- ゲスト廃止に伴う `/s/` の非公開化
- 退会済みユーザーの判定（`isWithdrawnUserMetadata`）
- 法的同意の確認（`hasLegalConsentMark`）

が足されている。CSP・`X-Frame-Options`・`Referrer-Policy` はすでに同じものが入っている。
`CRON_SECRET` も本番で動作確認済み（2026-08-12）。**このタスクは取り込む必要が無い。**

### 10 が半分な理由

`components/ui/web-vitals-reporter.tsx` と `lib/domain/shared/web-vitals.ts` は main にある。
`app/api/performance/vitals/route.ts` もあるが、`console.info` に出すだけで保存しない。
コード中のコメントが「保存は DBスキーマを伴う別作業として扱う」と明記している。
つまり migration 024 がその「別作業」にあたる。

### 破棄してよいもの

`lib/server/admin/public-answer.ts`（300行）、`public-settlement.ts`（148行）、`public-invite.ts`（34行）。

これらは共有ページを service role で動かすための堅牢化コード。migration 030 で
共有ページを本人のクライアント＋参加者RLSに移したため、**守る対象そのものが無くなった**。
`app/s/` に `createSupabaseAdminClient` は1箇所も残っていない。

## マイグレーションの扱い

4本とも番号が既存と衝突している。振り直しが要る。

| ブランチ | 振り直し先 | 中身 | 注意 |
|---|---|---|---|
| `021_function_privilege_hardening` (312行) | `032_` | `private` スキーマへの補助関数移設、`public` 関数の実行権限剥奪 | `list_owned_event_ids` の剥奪が**旧5引数のシグネチャ**を指している。029 で `p_query` が増えたので、そのままでは対象の関数が見つからない |
| `022_page_query_performance` (661行) | `033_` | 索引7本、RPC 5本、ポリシー2本 | ポリシー `Joined members can view plans` などが 030 の参加者ポリシーと**重なる**。名前は違うので壊れないが、同じ意味の許可が二重になる |
| `023_rate_limits_and_security_audit` (2,085行) | `034_` | `private.rate_limit_buckets` / `private.security_audit_logs` の2テーブルと関数13本 | 単独で最大。分割を検討する |
| `024_performance_measurements` (136行) | `035_` | `private.web_vital_samples` テーブルと記録・削除の関数 | `private.rate_limit_for` を 023 と重複定義している。023 を入れる前提の順番になっている |

## 実測でわかったこと（2026-08-12、タスク3の成果）

`scripts/security/verify-function-privileges.mjs` を本番へ当てた結果、
**保護対象13関数すべてが匿名で実行できた**（全部 status 200）。

各マイグレーションには `revoke all on function ... from public` が書いてあるのに効いていない。
Supabase が `anon` ロールへ実行権限を**個別に**付与しているため、`public` からの剥奪だけでは残る。
ブランチの 021 が `from public` と `from anon` の両方を剥奪しているのは、これを踏まえたものだった。

### 実害があるのは3本

| 関数 | 引数 | `auth.uid()` の照合 | 匿名で呼んだとき |
|---|---|---|---|
| `have_shared_event(a, b)` | 他人のUUID 2つ | **無し** | 2人が同じイベントにいるかが分かる |
| `is_user_blocked(a, b)` | 他人のUUID 2つ | **無し** | 2人がブロック関係かが分かる |
| `is_following(a, b)` | 他人のUUID 2つ | **無し** | a が b をフォローしているかが分かる |

いずれも `security definer` で、呼び出し元を見ていない。ユーザーUUIDを2つ知っていれば、
ログインせずに交友関係を1件ずつ確かめられる。

残り10本（`is_plan_participant` など単一IDの判定と `list_owned_event_ids`）は
内部で `auth.uid()` と突き合わせるので、匿名では常に false か空を返す。
叩けること自体は望ましくないが、情報は漏れない。

### 使い方

```
set -a; . ./.env.local; set +a
SECURITY_TEST_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" \
SECURITY_TEST_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" \
ALLOW_PRODUCTION_SECURITY_PROBE=true \
node scripts/security/verify-function-privileges.mjs
```

本番へ向けるときは `ALLOW_PRODUCTION_SECURITY_PROBE=true` が要る。うっかり本番へ
本物のJWTを流さないための入口。既定の `anon-only` モードは読み取りだけで、
状態を変える関数（`block_user_atomic`、`mark_plan_settling`）には触れない。

## 取り込みの順番（案）

依存の少ないものから。1スライス = 1ブランチ = 1マージ。

1. ~~**DB権限の検証スクリプト**（タスク3）~~ — 済（2026-08-12）。上の実測結果がその成果
2. **関数の権限剥奪**（タスク2 → 032）— 030 の6関数を足したうえで書き直す
3. **Web Vitals の保存**（タスク10 → 035 相当）— 小さく、既存コードの穴埋めで完結する。ただし 023 の `rate_limit_for` を切り出す必要あり
4. **索引とRPC**（タスク4 → 033）— 効果が見えやすい。ポリシー2本は 030 と突き合わせてから
5. **つながりのページング**（タスク5）、**カレンダーの月絞り**（タスク6）、**イベント詳細の分割**（タスク7）— 4 のRPCに乗る
6. **レート制限と監査ログ**（タスク8 → 034）— 最大。ここだけで数セッション
7. **大量データの自動検証**（タスク11）、**旧補助関数の掃除**（タスク12）— 仕上げ

## 持ち込むもの・持ち込まないもの

**持ち込む**

- `package.json` のスクリプト4本（`security:verify-db`、`perf:seed`、`perf:rpc`、`perf:lighthouse`）
- `lighthouse` の devDependency（タスク11のとき）
- `.env.example` の追記32行

**持ち込まない**

- `lib/server/admin/public-*.ts`（上記のとおり前提が消えた）
- タスク9 のミドルウェア差分（main のほうが新しい）
- ブランチ側の `docs/current-status.md`（main が進んでいる）

## リスク

- **本番DBへのマイグレーション適用は4回発生する。** どれもロールバック手順を用意してから流す
- `023` は 2,085行あり、レビューが現実的でない。テーブル追加・関数・ポリシーで分割したい
- ブランチのテストは旧フォルダ構成のパスを前提にしている。移植のたびに配置換えが要る
- 取り込みの途中で main が動くと衝突する。スライスごとに短く切って、こまめにマージする
