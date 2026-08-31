-- CI 専用: Supabase の storage-api コンテナが作る storage スキーマの最小スタブ。
--
-- supabase/postgres イメージ単体には storage スキーマが無く、
-- 019_user_profiles_and_avatars.sql の storage.buckets / storage.objects /
-- storage.foldername() 参照で落ちる。本番では storage-api が用意する。
-- ここでは「マイグレーションがエラーなく適用できるか」だけを検証したいので、
-- 実挙動までは再現しない最小限の定義を置く。
--
-- このファイルは CI の migrations ジョブでのみ実行する（scripts/apply-migrations.sh の前）。
-- 本番・ローカルの実 Supabase では実行しない。

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb
);

alter table storage.objects enable row level security;

-- storage.foldername('a/b/c.png') -> {a,b}
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
begin
  return (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
end;
$$;
