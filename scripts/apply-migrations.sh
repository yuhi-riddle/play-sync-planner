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
