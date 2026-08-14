-- フォロー・フォロー解除・お気に入り切り替えを、block_user_atomic（035）と同じ
-- 「1本のセキュリティ定義関数に集約する」形に揃える。
--
-- docs/codex-branch-triage.md のタスク12（旧補助関数への依存をなくす）の対応。
-- ただし旧ブランチに直接対応するコミットは無く、中身は現行mainを調べて決めた。
--
-- 従来（lib/actions/account/connections.ts の requireConnectionTarget）は、
-- have_shared_event / is_user_blocked を admin クライアントで2回別々に呼んでから、
-- 書き込みはセッションクライアントで別途行っていた。実害（無認可の情報漏洩）は無い
-- （user_connections / user_favorites には元から同じ条件のRLSポリシー（017/018）が
-- 効いており、書き込みそのものはRLSで守られている）。ただし block_user_atomic と違って
-- レート制限・監査ログが無く、チェックと書き込みが別トランザクションだった。
--
-- 支払い・金額系のロジックには一切関係しない。フォロー・お気に入りの判定条件
-- （共通イベント必須、ブロック中は不可、お気に入りはフォロー中のみ）も変えない。

begin;

-- ---------------------------------------------------------------------------
-- follow_user_atomic
-- ---------------------------------------------------------------------------

create or replace function public.follow_user_atomic(target_user_id uuid)
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

  -- block_user_atomic と同じ理由で、レート制限を他の検証より先に消費する。
  retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');
  if retry_seconds > 0 then
    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = retry_seconds::text;
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid follow target';
  end if;

  if not public.have_shared_event(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP01',
      message = 'A shared event is required';
  end if;

  if public.is_user_blocked(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP03',
      message = 'Blocked relationship';
  end if;

  insert into public.user_connections (follower_user_id, followed_user_id)
  values (current_user_id, target_user_id)
  on conflict (follower_user_id, followed_user_id) do nothing;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'connection_follow', 'user', target_user_id, 'success');
end;
$$;

revoke all on function public.follow_user_atomic(uuid) from public, anon;
grant execute on function public.follow_user_atomic(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- unfollow_user_atomic
--
-- 従来のrequireConnectionTargetと同じく、共通イベント必須・非ブロックの
-- チェックを外さない（フォロー解除だけ緩めると既存の挙動が変わるため）。
-- ---------------------------------------------------------------------------

create or replace function public.unfollow_user_atomic(target_user_id uuid)
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

  retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');
  if retry_seconds > 0 then
    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = retry_seconds::text;
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid follow target';
  end if;

  if not public.have_shared_event(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP01',
      message = 'A shared event is required';
  end if;

  if public.is_user_blocked(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP03',
      message = 'Blocked relationship';
  end if;

  delete from public.user_connections
  where follower_user_id = current_user_id
    and followed_user_id = target_user_id;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'connection_unfollow', 'user', target_user_id, 'success');
end;
$$;

revoke all on function public.unfollow_user_atomic(uuid) from public, anon;
grant execute on function public.unfollow_user_atomic(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- toggle_favorite_atomic
--
-- 「フォロー中またはお気に入り済みの人だけをお気に入りにできる」という
-- 018_require_follow_for_favorites.sql のRLS条件と同じ判定をアプリ側の
-- 分かりやすいエラーとして返す（RLS自体は従来どおり効いたまま）。
-- ---------------------------------------------------------------------------

create or replace function public.toggle_favorite_atomic(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  retry_seconds integer;
  already_favorite boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');
  if retry_seconds > 0 then
    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = retry_seconds::text;
  end if;

  if target_user_id is null or target_user_id = current_user_id then
    raise exception 'Invalid favorite target';
  end if;

  if not public.have_shared_event(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP01',
      message = 'A shared event is required';
  end if;

  if public.is_user_blocked(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP03',
      message = 'Blocked relationship';
  end if;

  select exists (
    select 1
    from public.user_favorites
    where user_id = current_user_id
      and favorite_user_id = target_user_id
  ) into already_favorite;

  if not already_favorite and not public.is_following(current_user_id, target_user_id) then
    raise exception using
      errcode = 'PSP04',
      message = 'Must be following to favorite';
  end if;

  if already_favorite then
    delete from public.user_favorites
    where user_id = current_user_id
      and favorite_user_id = target_user_id;

    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'connection_favorite_remove', 'user', target_user_id, 'success');
  else
    insert into public.user_favorites (user_id, favorite_user_id)
    values (current_user_id, target_user_id);

    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'connection_favorite_add', 'user', target_user_id, 'success');
  end if;
end;
$$;

revoke all on function public.toggle_favorite_atomic(uuid) from public, anon;
grant execute on function public.toggle_favorite_atomic(uuid) to authenticated;

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.toggle_favorite_atomic(uuid);
-- drop function if exists public.unfollow_user_atomic(uuid);
-- drop function if exists public.follow_user_atomic(uuid);
--
-- TypeScript側を requireConnectionTarget を使う旧実装に戻す必要がある
-- （lib/actions/account/connections.ts の該当コミットをrevert）。
