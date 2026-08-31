# マイグレーション適用を CI で検証する（High 3）

## 背景

`docs/review/2026-08-30-fix-plan.md` High 3 の再レビュー指摘。

- `README.md:85-103` は 001–019、`docs/release-checklist.md:24-54` は 001–031 しか適用対象として列挙していない。
  実ファイルは `039_connection_action_rate_limit.sql` まである。
- `supabase/` 配下は `migrations/` のみ。`config.toml` なし、Supabase CLI 連携なし、
  `.github/workflows/ci.yml` にマイグレーション適用ステップなし。適用は Supabase の SQL Editor で手作業だけ。
- 本番 Supabase には 032〜039 は適用済み（ユーザー確認済み）。本番の不整合リスクは現時点ではない。
  新環境の構築ミスと、今後のマイグレーション追加漏れを防ぐための対応。

## grill-me 確定事項

- Supabase CLI は導入しない。`config.toml` も追加しない。
- CI で一時 PostgreSQL に `supabase/migrations/*.sql` を番号順に適用し、失敗したら赤にする。
- README / チェックリストの手動番号列挙をやめ、「`supabase/migrations/` を番号順にすべて」に書き換える。

## 目的

- マイグレーションの追加漏れ・順序ミス・SQL エラーを、マージ前に CI で検出できるようにする。
- セットアップ文書を「全部順番に適用」に統一し、番号のメンテを不要にする。

## スコープ

**対象**

- `.github/workflows/ci.yml` — マイグレーション適用ジョブを追加（**設定ファイル。この設計docで差分を承認してから実装**）
- `scripts/apply-migrations.sh`（新規）— `supabase/migrations/*.sql` を番号順に `psql` で流すスクリプト
- `README.md` — マイグレーション手順の書き換え
- `docs/release-checklist.md` — マイグレーション手順の書き換え

**対象外**

- 本番へのマイグレーション適用作業（済み）。
- RLS の実挙動テスト・RPC の統合テスト → Low 1。High 3 で立てる PostgreSQL コンテナを土台に、後続の別 PR で追加する。
  この設計では「全マイグレーションがエラーなく適用できる」ことだけを確認する。

## マイグレーションが必要とする Supabase 固有オブジェクト

`supabase/migrations/` を grep した結果:

| 依存 | 使用箇所 |
|---|---|
| ロール `anon` / `authenticated` / `service_role` | `to authenticated` 107、`anon` 39、`service_role` 15 |
| `auth.uid()` / `auth.role()` | `auth.uid` 111、`auth.role` 1 |
| `auth.users` テーブル（FK 参照） | 41 |
| `storage.buckets` / `storage.objects` / `storage.foldername()` | `019_user_profiles_and_avatars.sql` |
| 拡張 `pgcrypto` | `create extension if not exists pgcrypto` ×2 |
| `gen_random_uuid()` | 26（PostgreSQL 13+ のコア関数、問題なし） |

`pg_net` / `vault` / `pg_cron` / `supabase_functions` などへの依存はなし。

素の `postgres:16` イメージにはロールも `auth` / `storage` スキーマも無いため、そのままでは適用できない。

## 設計

### PostgreSQL コンテナ

`services:` に **`supabase/postgres`** イメージを使う。ロール（`anon` / `authenticated` / `service_role` /
`supabase_admin` ほか）、`auth` / `storage` スキーマ、`auth.uid()` / `auth.role()`、`storage.foldername()`、
拡張が最初から入っている。Supabase CLI は不要。

```yaml
  migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: supabase/postgres:15.8.1.060   # 実装時に現行の安定タグを確認して固定
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 20
    steps:
      - uses: actions/checkout@v4
      - name: Apply migrations in order
        env:
          PGHOST: localhost
          PGPORT: "5432"
          PGUSER: postgres
          PGPASSWORD: postgres
          PGDATABASE: postgres
        run: bash scripts/apply-migrations.sh
```

- 既存の `build` ジョブとは独立した並列ジョブにする（`build` の所要時間を伸ばさない）。
- イメージタグは固定する（`latest` を使わない）。実装時に Docker Hub で現行の安定タグを確認。

### `scripts/apply-migrations.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

MIGRATIONS_DIR="$(dirname "$0")/../supabase/migrations"

shopt -s nullglob
files=("$MIGRATIONS_DIR"/*.sql)
shopt -u nullglob

if [ ${#files[@]} -eq 0 ]; then
  echo "no migration files found" >&2
  exit 1
fi

# ファイル名は 3 桁ゼロ埋め番号プレフィックスなので、辞書順 = 適用順。
IFS=$'\n' files=($(sort <<<"${files[*]}")); unset IFS

for f in "${files[@]}"; do
  echo "==> applying $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --no-psqlrc -q -f "$f"
done

echo "all ${#files[@]} migrations applied cleanly"
```

- `ON_ERROR_STOP=1` で最初のエラーで停止し、ジョブが赤になる。
- ローカルでも `PGHOST=... bash scripts/apply-migrations.sh` で同じ確認ができる。

### 既知の許容事項

`README.md` に記載のとおり、`009_site_notifications.sql` は `013_repair_notifications_setup.sql` が
含む修復版と重複する部分がある。009 → 013 を順に流す分には `create ... if not exists` /
`create or replace` で吸収される想定。実装時に実際に流して確認する。もし 009 で
`42P07 relation already exists` 等が出るなら、そのマイグレーション自体を冪等に直す
（テストを通すためにスクリプト側でエラーを握りつぶさない）。

### README.md の書き換え

`supabase/migrations/001_phase1_schema.sql` … `019_...` のリストを次に置き換える:

```text
supabase/migrations/ 内の SQL ファイルを、ファイル名の番号順にすべて実行します。
（`001_` から最新番号まで。CI が全ファイルの適用を検証しています。）
```

`009_site_notifications.sql` の 42P07 に関する注記は残す。

### docs/release-checklist.md の書き換え

`- [ ] supabase/migrations/001_...` 〜 `031_...` のチェック項目を、次の1〜2項目に置き換える:

```text
- [ ] `supabase/migrations/` の SQL を番号順にすべて適用した（未適用の番号がない）
- [ ] 適用中にエラーが出た場合、ファイル名とエラー全文を控えた
```

`009` / `013` の注記は残す。

## テスト / 検証

- CI の `migrations` ジョブが緑になること（= 全 40 ファイルがエラーなく適用できる）。
- わざと壊れた SQL を持つコミットを push すると赤になること（ローカルで1回試す。コミットはしない）。
- `bash scripts/apply-migrations.sh` がローカルの `supabase/postgres` コンテナに対して通ること。

## 実施手順（Codex へ委譲）

1. `scripts/apply-migrations.sh` を追加。
2. ローカル（または CI 相当）で `supabase/postgres` に対して流し、全マイグレーションが通ることを確認。
   通らないマイグレーションがあれば、そのファイルを冪等に直す（`if not exists` / `or replace` の追加など）。
   スクリプトでエラーを握りつぶさない。
3. `.github/workflows/ci.yml` に `migrations` ジョブを追加。
4. `README.md` と `docs/release-checklist.md` を書き換え。
5. `npm run lint` / `npm run typecheck` / `npm test` に影響がないことを確認（コードは変えないので通るはず）。

コミットは項目ごと。push・PR まで進め、マージはしない。
