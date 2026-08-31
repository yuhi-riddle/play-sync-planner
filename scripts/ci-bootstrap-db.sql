-- CI 専用: 素の postgres イメージに、マイグレーションが前提とする Supabase 提供オブジェクトの
-- 最小スタブを用意する。
--
-- 本番の Supabase では auth / storage スキーマ、anon / authenticated / service_role ロール、
-- auth.uid() などはプラットフォームが用意する。CI では「マイグレーションがエラーなく
-- 順番に適用できるか」だけを検証したいので、実挙動までは再現しない最小限の定義を置く。
--
-- このファイルは CI の migrations ジョブでのみ実行する（scripts/apply-migrations.sh の前）。
-- 本番・ローカルの実 Supabase では実行しない。

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- ロール
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to current_user;

-- ---------------------------------------------------------------------------
-- auth スキーマ
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- 実 Supabase では JWT クレームから取る。CI では常に NULL でよい
-- （RLS ポリシーの構文が通ることだけ確認する）。
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '');
$$;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

grant usage on schema auth to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage スキーマ
-- ---------------------------------------------------------------------------
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

grant usage on schema storage to anon, authenticated, service_role;
