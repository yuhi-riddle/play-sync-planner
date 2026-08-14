-- 認証済みユーザーの書き込みに対するレート制限と監査ログの基盤。
--
-- wip/legacy-helper-test の 023_rate_limits_and_security_audit.sql（2,085行）から、
-- 決済系（record_settlement_payment 等4関数）を除いた範囲を移植する
-- （docs/codex-branch-triage.md「取り込みの順番（案）」6番目、タスク8）。
--
-- 023から意図的に持ち込まないもの（理由込み）:
--   - 24テーブル一括のbeforeトリガー（enforce_authenticated_rate_limit）。
--     operation名の対応漏れが1つでもあると、そのテーブルへの書き込みが
--     即座に例外で失敗する。ブラスト半径が大きすぎるため、今回は
--     個別のRPC内で明示的にレート制限を呼ぶ方式に限定する。
--   - public.consume_public_rate_limit（service_role必須の設計）。
--     migration 030 で共有ページを参加者本人のセッション＋RLSに移した後は
--     service_role を経由しないため、前提が成立しない。
--   - public.record_security_audit（service_role必須）。認証済みユーザーが
--     呼ぶRPCの内部から監査ログを書きたいので、各RPCが
--     private.security_audit_logs へ直接insertする形にする。
--   - notifications テーブルのポリシー変更（insert無しの3本構成への置き換え）。
--     現状の単一ポリシー（013）にinsertが含まれており、置き換えが安全かの
--     検証（authenticatedクライアントからの直接insert有無の洗い出し）が
--     別途要るため見送り。
--   - join_event_from_invite・restart_plan_adjustment。前者はカレンダー連携
--     必須化というmainが撤廃済みの制約を含み、後者は共有リンクモデル
--     （030）以前の通知組み立てのまま。単純移植ではなく再設計が要るため
--     別セッションで扱う。
--
-- エラーの返し方も023から変更している。023は「マジックUUID」「負の整数」を
-- returnして分岐させる方式だったが、TypeScript側で扱いにくく、他のRPC
-- （migration 033/034）とも作法が違う。ここでは「例外を投げると監査ログの
-- insertごとロールバックされてしまう」問題を避けるため、成功/失敗を
-- jsonb で返す方式にする（denyケースでも監査ログは残したいため）。
-- 認証チェックなど「RPCの誤用でしか起きない」ケースだけは従来通り例外にする。

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- レート制限バケット・監査ログ
-- ---------------------------------------------------------------------------

create table private.rate_limit_buckets (
  operation text not null,
  subject_hash bytea not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (operation, subject_hash, window_started_at)
);

create table private.security_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  operation text not null,
  target_type text not null,
  target_id uuid,
  outcome text not null check (outcome in ('success', 'denied')),
  created_at timestamptz not null default now()
);

create index rate_limit_buckets_window_started_at_idx
on private.rate_limit_buckets(window_started_at);

create index security_audit_logs_created_at_idx
on private.security_audit_logs(created_at);

revoke all on table private.rate_limit_buckets from public, anon, authenticated, service_role;
revoke all on table private.security_audit_logs from public, anon, authenticated, service_role;
revoke all on sequence private.security_audit_logs_id_seq from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- レート制限の判定・消費（内部ヘルパー、RPCの外からは呼ばない）
--
-- operation の一覧は、今回実際にレート制限を付ける先だけに絞っている。
-- 今後さらにRPCへレート制限を足すときは、ここに case を1行足す。
-- ---------------------------------------------------------------------------

create or replace function private.rate_limit_for(p_operation text)
returns integer
language sql
immutable
security definer
set search_path = ''
as $$
  select case p_operation
    when 'event_message_post' then 20
    when 'event_invitation_create' then 30
    when 'event_invitation_respond' then 30
    when 'connection_update' then 30
    else null
  end;
$$;

revoke all on function private.rate_limit_for(text) from public;

create or replace function private.try_consume_rate_limit(
  p_operation text,
  p_subject_hash bytea
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  operation_limit integer := private.rate_limit_for(p_operation);
  window_start timestamptz := to_timestamp(floor(extract(epoch from clock_timestamp()) / 60) * 60);
  next_count integer;
  retry_seconds integer;
begin
  if operation_limit is null then
    raise exception using errcode = '22023', message = 'Unsupported rate limit operation';
  end if;

  if p_subject_hash is null or octet_length(p_subject_hash) <> 32 then
    raise exception using errcode = '22023', message = 'Invalid rate limit subject';
  end if;

  insert into private.rate_limit_buckets (operation, subject_hash, window_started_at, request_count)
  values (p_operation, p_subject_hash, window_start, 1)
  on conflict (operation, subject_hash, window_started_at)
  do update set request_count = private.rate_limit_buckets.request_count + 1
  returning request_count into next_count;

  if next_count > operation_limit then
    retry_seconds := greatest(
      1,
      least(60, ceil(extract(epoch from (window_start + interval '60 seconds' - clock_timestamp())))::integer)
    );
    return retry_seconds;
  end if;

  return 0;
end;
$$;

revoke all on function private.try_consume_rate_limit(text, bytea) from public;

-- 認証済みユーザー単位（auth.uid()のハッシュ）でのレート制限。
-- 同一トランザクション内で複数回呼ばれても1回しか消費しないよう、
-- request設定（current_setting）に結果をキャッシュする。
create or replace function private.try_consume_authenticated_rate_limit_once(
  p_operation text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  setting_name text := 'request.rate_limit_' || p_operation;
  prior_result text;
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;

  prior_result := current_setting(setting_name, true);
  if prior_result is not null and prior_result <> '' then
    return prior_result::integer;
  end if;

  retry_seconds := private.try_consume_rate_limit(p_operation, digest(current_user_id::text, 'sha256'));
  perform set_config(setting_name, retry_seconds::text, true);
  return retry_seconds;
end;
$$;

revoke all on function private.try_consume_authenticated_rate_limit_once(text) from public;

-- ---------------------------------------------------------------------------
-- 保持期間の掃除（migration 033のpurge_expired_web_vitalsと同じ運用。
-- cronでの自動配線は別途。service_role専用）
-- ---------------------------------------------------------------------------

create or replace function public.purge_expired_security_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_buckets integer;
  deleted_audits integer;
begin
  delete from private.rate_limit_buckets where window_started_at < clock_timestamp() - interval '90 days';
  get diagnostics deleted_buckets = row_count;

  delete from private.security_audit_logs where created_at < clock_timestamp() - interval '90 days';
  get diagnostics deleted_audits = row_count;

  return deleted_buckets + deleted_audits;
end;
$$;

revoke all on function public.purge_expired_security_data() from public, anon, authenticated;
grant execute on function public.purge_expired_security_data() to service_role;

-- ---------------------------------------------------------------------------
-- block_user_atomic にレート制限と監査ログを追加する。
-- 本体のロジック（020_event_list_performance_and_atomic_block.sql）は
-- そのまま維持し、rate limit の呼び出しと audit log の insert だけ足す。
--
-- ついでに、032で13関数に対して行ったのと同じ anon 個別権限の剥奪を
-- block_user_atomic にも行う。032の検証スクリプトは「状態を変える関数には
-- 触れない」設計のため、この関数はこれまで匿名実行できるかどうかが
-- 未検証のまま残っていた。今回レート制限を足すのでついでに閉じておく。
-- ---------------------------------------------------------------------------

create or replace function public.block_user_atomic(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  -- レート制限は他の検証より先に消費する（post_event_message等、他の3関数と
  -- 同じ並び）。shared-event判定を先にすると、その判定だけレート制限を
  -- 消費せずに何度でも呼べてしまい、target_user_idを総当たりして
  -- 「誰と共有イベントがあるか」を無制限に調べられてしまう。
  retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');
  if retry_seconds > 0 then
    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = retry_seconds::text;
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid block target';
  end if;

  if not public.have_shared_event(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP01',
      message = 'A shared event is required';
  end if;

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (current_user_id, target_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  delete from public.user_connections
  where (follower_user_id = current_user_id and followed_user_id = target_user_id)
     or (follower_user_id = target_user_id and followed_user_id = current_user_id);

  delete from public.user_favorites
  where (user_id = current_user_id and favorite_user_id = target_user_id)
     or (user_id = target_user_id and favorite_user_id = current_user_id);

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'connection_block', 'user', target_user_id, 'success');
end;
$$;

revoke all on function public.block_user_atomic(uuid) from anon;

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- 023より前のblock_user_atomicへ戻す場合は 020_event_list_performance_and_atomic_block.sql
-- の定義（レート制限・監査ログ・anon revoke無し）を create or replace で再適用する。
--
-- drop function if exists public.purge_expired_security_data();
-- drop function if exists private.try_consume_authenticated_rate_limit_once(text);
-- drop function if exists private.try_consume_rate_limit(text, bytea);
-- drop function if exists private.rate_limit_for(text);
-- drop table if exists private.security_audit_logs;
-- drop table if exists private.rate_limit_buckets;
