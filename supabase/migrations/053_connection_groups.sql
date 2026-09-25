-- つながりのグループ（自分だけに見える仕分け）。
-- 設計: docs/superpowers/specs/2026-09-25-connection-groups-design.md
--
-- エラーコード:
--   PSP05 グループ数の上限（20）
--   PSP06 メンバー数の上限（30）
--   PSP07 同じ名前のグループがある
--   PSP08 入れられない人（本人・ブロック関係・一緒に参加もフォローもしていない）
--   PSP09 グループが見つからない（他人のグループも含む）
--   PSP10 名前か色が不正

begin;

create table public.connection_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'nazotoki',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint connection_groups_name_check check (name = btrim(name) and char_length(name) between 1 and 20),
  constraint connection_groups_color_check check (
    color in ('nazotoki', 'boardgame', 'travel', 'live', 'drinking', 'snowboard', 'movie_stage', 'honey')
  ),
  constraint connection_groups_owner_name_key unique (owner_user_id, name)
);

create index connection_groups_owner_created_idx
on public.connection_groups(owner_user_id, created_at, id);

create table public.connection_group_members (
  group_id uuid not null references public.connection_groups(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_user_id)
);

create index connection_group_members_member_idx
on public.connection_group_members(member_user_id);

-- 読み取りだけ本人に許す。書き込みは下の RPC からだけ行う（ポリシーを作らない）。
alter table public.connection_groups enable row level security;
alter table public.connection_group_members enable row level security;

create policy "Owners can read their connection groups"
on public.connection_groups
for select
to authenticated
using (owner_user_id = auth.uid());

create policy "Owners can read their connection group members"
on public.connection_group_members
for select
to authenticated
using (
  exists (
    select 1
    from public.connection_groups as owned_group
    where owned_group.id = connection_group_members.group_id
      and owned_group.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------------------------
-- 内部関数
-- ---------------------------------------------------------------------------

-- 表示名は list_connections（migration 050）と同じ順で決める。
create or replace function private.connection_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(btrim((select profile.nickname from public.profiles as profile where profile.user_id = p_user_id)), ''),
    nullif(btrim((
      select event_member.display_name
      from public.event_members as event_member
      where event_member.user_id = p_user_id
      order by event_member.created_at desc, event_member.event_id desc
      limit 1
    )), ''),
    'Madoiユーザー'
  );
$$;

create or replace function private.is_connection_group_member_eligible(p_owner uuid, p_member uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_member is not null
    and p_member <> p_owner
    and not public.is_user_blocked(p_owner, p_member)
    and (
      public.have_shared_event(p_owner, p_member)
      or exists (
        select 1
        from public.user_connections as following
        where following.follower_user_id = p_owner
          and following.followed_user_id = p_member
      )
    );
$$;

-- 認証と回数制限をまとめて行い、操作する本人の ID を返す。
create or replace function private.consume_connection_group_action()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_retry_seconds integer;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  v_retry_seconds := private.try_consume_authenticated_rate_limit_once('connection_update');
  if v_retry_seconds > 0 then
    raise exception using
      errcode = 'PSP02',
      message = 'Rate limit exceeded',
      detail = v_retry_seconds::text;
  end if;

  return v_actor;
end;
$$;

-- 名前を整えて返す。名前か色が不正なら PSP10。
create or replace function private.normalize_connection_group_input(p_name text, p_color text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 20
     or p_color is null
     or p_color not in ('nazotoki', 'boardgame', 'travel', 'live', 'drinking', 'snowboard', 'movie_stage', 'honey') then
    raise exception using errcode = 'PSP10', message = 'Invalid connection group name or color';
  end if;
  return v_name;
end;
$$;

create or replace function private.add_connection_group_members_internal(
  p_owner uuid,
  p_group_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_ids uuid[];
  v_current_count integer;
  v_new_count integer;
begin
  select coalesce(array_agg(distinct member_id), '{}')
  into v_member_ids
  from unnest(coalesce(p_member_ids, '{}')) as member_id;

  if cardinality(v_member_ids) = 0 then
    return;
  end if;

  if exists (
    select 1
    from unnest(v_member_ids) as member_id
    where not private.is_connection_group_member_eligible(p_owner, member_id)
  ) then
    raise exception using errcode = 'PSP08', message = 'Member is not eligible';
  end if;

  select count(*) into v_current_count
  from public.connection_group_members as member
  where member.group_id = p_group_id;

  select count(*) into v_new_count
  from unnest(v_member_ids) as member_id
  where not exists (
    select 1
    from public.connection_group_members as member
    where member.group_id = p_group_id
      and member.member_user_id = member_id
  );

  if v_new_count > 0 and v_current_count + v_new_count > 30 then
    raise exception using errcode = 'PSP06', message = 'Member limit reached';
  end if;

  insert into public.connection_group_members (group_id, member_user_id)
  select p_group_id, member_id
  from unnest(v_member_ids) as member_id
  on conflict (group_id, member_user_id) do nothing;
end;
$$;

revoke all on function private.connection_display_name(uuid) from public;
revoke all on function private.is_connection_group_member_eligible(uuid, uuid) from public;
revoke all on function private.consume_connection_group_action() from public;
revoke all on function private.normalize_connection_group_input(text, text) from public;
revoke all on function private.add_connection_group_members_internal(uuid, uuid, uuid[]) from public;

-- ---------------------------------------------------------------------------
-- 作成・一覧
-- ---------------------------------------------------------------------------

create function public.create_connection_group(
  p_name text,
  p_color text,
  p_member_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
  v_name text := private.normalize_connection_group_input(p_name, p_color);
  v_group_id uuid;
begin
  if (select count(*) from public.connection_groups as owned where owned.owner_user_id = v_actor) >= 20 then
    raise exception using errcode = 'PSP05', message = 'Group limit reached';
  end if;

  if exists (
    select 1 from public.connection_groups as owned
    where owned.owner_user_id = v_actor and owned.name = v_name
  ) then
    raise exception using errcode = 'PSP07', message = 'Duplicate group name';
  end if;

  insert into public.connection_groups (owner_user_id, name, color)
  values (v_actor, v_name, p_color)
  returning id into v_group_id;

  perform private.add_connection_group_members_internal(v_actor, v_group_id, p_member_ids);

  return v_group_id;
end;
$$;

create function public.list_connection_groups()
returns table(
  group_id uuid,
  name text,
  color text,
  member_count bigint,
  member_names text[],
  active_event_count bigint,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    owned.id,
    owned.name,
    owned.color,
    (select count(*) from public.connection_group_members as member where member.group_id = owned.id)::bigint,
    coalesce((
      select array_agg(first_members.display_name order by first_members.created_at, first_members.member_user_id)
      from (
        select member.member_user_id, member.created_at, private.connection_display_name(member.member_user_id) as display_name
        from public.connection_group_members as member
        where member.group_id = owned.id
        order by member.created_at, member.member_user_id
        limit 5
      ) as first_members
    ), '{}'::text[]),
    (
      select count(distinct my_membership.event_id)
      from public.event_members as my_membership
      join public.event_members as their_membership
        on their_membership.event_id = my_membership.event_id
        and their_membership.status = 'joined'
      join public.connection_group_members as member
        on member.group_id = owned.id
        and member.member_user_id = their_membership.user_id
      join public.event_activity_state as activity
        on activity.event_id = my_membership.event_id
      where my_membership.user_id = v_actor
        and my_membership.status = 'joined'
        and activity.is_active
    )::bigint,
    owned.created_at
  from public.connection_groups as owned
  where owned.owner_user_id = v_actor
  order by owned.created_at, owned.id;
end;
$$;

create function public.get_connection_group(p_group_id uuid)
returns table(group_id uuid, name text, color text, member_count bigint, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    owned.id,
    owned.name,
    owned.color,
    (select count(*) from public.connection_group_members as member where member.group_id = owned.id)::bigint,
    owned.created_at
  from public.connection_groups as owned
  where owned.id = p_group_id
    and owned.owner_user_id = v_actor;
end;
$$;

create function public.list_connection_group_memberships()
returns table(group_id uuid, member_user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select member.group_id, member.member_user_id
  from public.connection_group_members as member
  join public.connection_groups as owned
    on owned.id = member.group_id
  where owned.owner_user_id = v_actor
  order by member.group_id, member.member_user_id;
end;
$$;

revoke all on function public.create_connection_group(text, text, uuid[]) from public;
revoke all on function public.create_connection_group(text, text, uuid[]) from anon;
grant execute on function public.create_connection_group(text, text, uuid[]) to authenticated;
grant execute on function public.create_connection_group(text, text, uuid[]) to service_role;

revoke all on function public.list_connection_groups() from public;
revoke all on function public.list_connection_groups() from anon;
grant execute on function public.list_connection_groups() to authenticated;
grant execute on function public.list_connection_groups() to service_role;

revoke all on function public.get_connection_group(uuid) from public;
revoke all on function public.get_connection_group(uuid) from anon;
grant execute on function public.get_connection_group(uuid) to authenticated;
grant execute on function public.get_connection_group(uuid) to service_role;

revoke all on function public.list_connection_group_memberships() from public;
revoke all on function public.list_connection_group_memberships() from anon;
grant execute on function public.list_connection_group_memberships() to authenticated;
grant execute on function public.list_connection_group_memberships() to service_role;


-- ---------------------------------------------------------------------------
-- 編集・削除・メンバー操作
-- ---------------------------------------------------------------------------

create or replace function private.require_owned_connection_group(p_owner uuid, p_group_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_group_id is null or not exists (
    select 1 from public.connection_groups as owned
    where owned.id = p_group_id and owned.owner_user_id = p_owner
  ) then
    raise exception using errcode = 'PSP09', message = 'Connection group not found';
  end if;
end;
$$;

revoke all on function private.require_owned_connection_group(uuid, uuid) from public;

create function public.update_connection_group(p_group_id uuid, p_name text, p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
  v_name text;
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  v_name := private.normalize_connection_group_input(p_name, p_color);

  if exists (
    select 1 from public.connection_groups as owned
    where owned.owner_user_id = v_actor and owned.name = v_name and owned.id <> p_group_id
  ) then
    raise exception using errcode = 'PSP07', message = 'Duplicate group name';
  end if;

  update public.connection_groups
  set name = v_name, color = p_color, updated_at = now()
  where id = p_group_id;
end;
$$;

create function public.delete_connection_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  delete from public.connection_groups where id = p_group_id;
end;
$$;

create function public.add_connection_group_members(p_group_id uuid, p_member_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  perform private.add_connection_group_members_internal(v_actor, p_group_id, p_member_ids);
  update public.connection_groups set updated_at = now() where id = p_group_id;
end;
$$;

create function public.remove_connection_group_member(p_group_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
begin
  perform private.require_owned_connection_group(v_actor, p_group_id);
  delete from public.connection_group_members
  where group_id = p_group_id and member_user_id = p_member_id;
  update public.connection_groups set updated_at = now() where id = p_group_id;
end;
$$;

-- 人の行の「グループに入れる」から、その人の所属を渡したグループだけにする。
create function public.set_person_connection_groups(p_member_id uuid, p_group_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.consume_connection_group_action();
  v_group_ids uuid[];
  v_group_id uuid;
begin
  select coalesce(array_agg(distinct group_id), '{}')
  into v_group_ids
  from unnest(coalesce(p_group_ids, '{}')) as group_id;

  foreach v_group_id in array v_group_ids loop
    perform private.require_owned_connection_group(v_actor, v_group_id);
  end loop;

  delete from public.connection_group_members as member
  using public.connection_groups as owned
  where owned.id = member.group_id
    and owned.owner_user_id = v_actor
    and member.member_user_id = p_member_id
    and not (member.group_id = any (v_group_ids));

  foreach v_group_id in array v_group_ids loop
    perform private.add_connection_group_members_internal(v_actor, v_group_id, array[p_member_id]);
  end loop;
end;
$$;

create function public.list_connection_group_members(p_group_id uuid)
returns table(user_id uuid, display_name text, shared_event_count bigint, is_following boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    member.member_user_id,
    private.connection_display_name(member.member_user_id),
    (
      select count(*)
      from public.event_members as mine
      join public.event_members as theirs
        on theirs.event_id = mine.event_id
        and theirs.status = 'joined'
        and theirs.user_id = member.member_user_id
      where mine.user_id = v_actor
        and mine.status = 'joined'
    )::bigint,
    exists (
      select 1 from public.user_connections as following
      where following.follower_user_id = v_actor
        and following.followed_user_id = member.member_user_id
    )
  from public.connection_group_members as member
  join public.connection_groups as owned
    on owned.id = member.group_id
    and owned.owner_user_id = v_actor
  where member.group_id = p_group_id
  order by member.created_at, member.member_user_id;
end;
$$;

-- グループ画面の「メンバーを追加」の候補。最大100人。
create function public.list_connection_group_candidates(p_group_id uuid)
returns table(user_id uuid, display_name text, shared_event_count bigint, is_following boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1 from public.connection_groups as owned
    where owned.id = p_group_id and owned.owner_user_id = v_actor
  ) then
    return;
  end if;

  return query
  with shared as (
    select other.user_id, count(*)::bigint as shared_event_count, max(other.created_at) as latest_shared_at
    from public.event_members as mine
    join public.event_members as other
      on other.event_id = mine.event_id
      and other.status = 'joined'
    where mine.user_id = v_actor
      and mine.status = 'joined'
      and other.user_id <> v_actor
    group by other.user_id
  ),
  followed as (
    select following.followed_user_id as user_id
    from public.user_connections as following
    where following.follower_user_id = v_actor
  ),
  people as (
    select
      coalesce(shared.user_id, followed.user_id) as user_id,
      coalesce(shared.shared_event_count, 0::bigint) as shared_event_count,
      shared.latest_shared_at,
      followed.user_id is not null as is_following
    from shared
    full join followed on followed.user_id = shared.user_id
  )
  select
    people.user_id,
    private.connection_display_name(people.user_id),
    people.shared_event_count,
    people.is_following
  from people
  where not public.is_user_blocked(v_actor, people.user_id)
    and not exists (
      select 1 from public.connection_group_members as member
      where member.group_id = p_group_id and member.member_user_id = people.user_id
    )
  order by people.latest_shared_at desc nulls last, people.user_id
  limit 100;
end;
$$;

revoke all on function public.update_connection_group(uuid, text, text) from public;
revoke all on function public.update_connection_group(uuid, text, text) from anon;
grant execute on function public.update_connection_group(uuid, text, text) to authenticated;
grant execute on function public.update_connection_group(uuid, text, text) to service_role;

revoke all on function public.delete_connection_group(uuid) from public;
revoke all on function public.delete_connection_group(uuid) from anon;
grant execute on function public.delete_connection_group(uuid) to authenticated;
grant execute on function public.delete_connection_group(uuid) to service_role;

revoke all on function public.add_connection_group_members(uuid, uuid[]) from public;
revoke all on function public.add_connection_group_members(uuid, uuid[]) from anon;
grant execute on function public.add_connection_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.add_connection_group_members(uuid, uuid[]) to service_role;

revoke all on function public.remove_connection_group_member(uuid, uuid) from public;
revoke all on function public.remove_connection_group_member(uuid, uuid) from anon;
grant execute on function public.remove_connection_group_member(uuid, uuid) to authenticated;
grant execute on function public.remove_connection_group_member(uuid, uuid) to service_role;

revoke all on function public.set_person_connection_groups(uuid, uuid[]) from public;
revoke all on function public.set_person_connection_groups(uuid, uuid[]) from anon;
grant execute on function public.set_person_connection_groups(uuid, uuid[]) to authenticated;
grant execute on function public.set_person_connection_groups(uuid, uuid[]) to service_role;

revoke all on function public.list_connection_group_members(uuid) from public;
revoke all on function public.list_connection_group_members(uuid) from anon;
grant execute on function public.list_connection_group_members(uuid) to authenticated;
grant execute on function public.list_connection_group_members(uuid) to service_role;

revoke all on function public.list_connection_group_candidates(uuid) from public;
revoke all on function public.list_connection_group_candidates(uuid) from anon;
grant execute on function public.list_connection_group_candidates(uuid) to authenticated;
grant execute on function public.list_connection_group_candidates(uuid) to service_role;


-- ---------------------------------------------------------------------------
-- ブロック・退会・つながりの振り分けの更新

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

  -- どちら向きのブロックでも、お互いのグループから外す。
  delete from public.connection_group_members as member
  using public.connection_groups as owned
  where owned.id = member.group_id
    and (
      (owned.owner_user_id = current_user_id and member.member_user_id = target_user_id)
      or (owned.owner_user_id = target_user_id and member.member_user_id = current_user_id)
    );

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'connection_block', 'user', target_user_id, 'success');
end;
$$;
revoke all on function public.block_user_atomic(uuid) from anon;

create or replace function public.finalize_account_withdrawal(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_withdrawn_name constant text := '退会したユーザー';
begin
  delete from public.user_connections where follower_user_id = target_user_id;
  delete from public.user_connections where followed_user_id = target_user_id;
  delete from public.user_favorites where user_id = target_user_id;
  delete from public.user_favorites where favorite_user_id = target_user_id;
  delete from public.connection_groups where owner_user_id = target_user_id;
  delete from public.connection_group_members where member_user_id = target_user_id;
  delete from public.user_blocks where blocker_user_id = target_user_id;
  delete from public.user_blocks where blocked_user_id = target_user_id;
  delete from public.event_user_invitations where inviter_user_id = target_user_id;
  delete from public.event_user_invitations where invitee_user_id = target_user_id;
  delete from public.notifications where user_id = target_user_id;
  delete from public.event_drafts where owner_user_id = target_user_id;
  delete from public.calendar_integrations where user_id = target_user_id;

  update public.event_members
  set display_name = v_withdrawn_name
  where user_id = target_user_id;

  update public.profiles
  set
    nickname = v_withdrawn_name,
    avatar_path = null,
    deleted_at = coalesce(deleted_at, now()),
    deletion_state = 'done'
  where user_id = target_user_id;
end;
$$;
revoke all on function public.finalize_account_withdrawal(uuid) from public;
revoke all on function public.finalize_account_withdrawal(uuid) from anon;
revoke all on function public.finalize_account_withdrawal(uuid) from authenticated;
grant execute on function public.finalize_account_withdrawal(uuid) to service_role;

create or replace function public.list_connections(
  p_category text,
  p_cursor_at timestamptz,
  p_cursor_user_id uuid,
  p_limit integer
)
returns table(
  user_id uuid,
  display_name text,
  shared_event_count bigint,
  active_shared_event_count bigint,
  latest_shared_at timestamptz,
  is_following boolean,
  is_followed_by boolean,
  is_favorite boolean,
  cursor_at timestamptz,
  cursor_user_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_category is null
    or p_category not in ('favorites', 'mutual', 'following', 'shared', 'blocked') then
    raise exception 'Invalid connection category';
  end if;

  return query
  with shared_memberships as (
    select
      other_member.user_id,
      count(*)::bigint as shared_event_count,
      count(*) filter (where activity.is_active)::bigint as active_shared_event_count,
      max(other_member.created_at) as latest_shared_at
    from public.event_members as current_member
    join public.event_members as other_member
      on other_member.event_id = current_member.event_id
      and other_member.status = 'joined'
    join public.event_activity_state as activity
      on activity.event_id = current_member.event_id
    where current_member.user_id = v_actor
      and current_member.status = 'joined'
      and other_member.user_id <> v_actor
    group by other_member.user_id
  ),
  visible_shared_memberships as (
    select shared_memberships.*
    from shared_memberships
    where not exists (
      select 1
      from public.user_blocks as relationship_block
      where (
        relationship_block.blocker_user_id = v_actor
        and relationship_block.blocked_user_id = shared_memberships.user_id
      )
      or (
        relationship_block.blocker_user_id = shared_memberships.user_id
        and relationship_block.blocked_user_id = v_actor
      )
    )
  ),
  relation_state as (
    select
      visible_shared_memberships.user_id,
      visible_shared_memberships.shared_event_count,
      visible_shared_memberships.active_shared_event_count,
      visible_shared_memberships.latest_shared_at,
      following.follower_user_id is not null as is_following,
      followed_by.follower_user_id is not null as is_followed_by,
      favorite.user_id is not null as is_favorite
    from visible_shared_memberships
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = visible_shared_memberships.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = visible_shared_memberships.user_id
      and followed_by.followed_user_id = v_actor
    left join public.user_favorites as favorite
      on favorite.user_id = v_actor
      and favorite.favorite_user_id = visible_shared_memberships.user_id
  ),
  classified_connections as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.active_shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
      relation_state.is_favorite,
      relation_state.latest_shared_at as cursor_at,
      relation_state.user_id as cursor_user_id,
      case
        when relation_state.is_following and relation_state.is_followed_by then 'mutual'
        when relation_state.is_following then 'following'
        else 'shared'
      end as category
    from relation_state

    union all

    select
      blocked_user.blocked_user_id as user_id,
      coalesce(shared_memberships.shared_event_count, 0::bigint) as shared_event_count,
      coalesce(shared_memberships.active_shared_event_count, 0::bigint) as active_shared_event_count,
      shared_memberships.latest_shared_at,
      false as is_following,
      false as is_followed_by,
      false as is_favorite,
      blocked_user.created_at as cursor_at,
      blocked_user.blocked_user_id as cursor_user_id,
      'blocked'::text as category
    from public.user_blocks as blocked_user
    left join shared_memberships
      on shared_memberships.user_id = blocked_user.blocked_user_id
    where blocked_user.blocker_user_id = v_actor
  ),
  enriched_connections as (
    select
      classified_connections.user_id,
      coalesce(nullif(btrim(profile.nickname), ''), nullif(btrim(member_name.display_name), ''), 'Madoiユーザー') as display_name,
      classified_connections.shared_event_count,
      classified_connections.active_shared_event_count,
      classified_connections.latest_shared_at,
      classified_connections.is_following,
      classified_connections.is_followed_by,
      classified_connections.is_favorite,
      classified_connections.cursor_at,
      classified_connections.cursor_user_id
    from classified_connections
    left join public.profiles as profile
      on profile.user_id = classified_connections.user_id
    left join lateral (
      select event_member.display_name
      from public.event_members as event_member
      where event_member.user_id = classified_connections.user_id
      order by event_member.created_at desc, event_member.event_id desc
      limit 1
    ) as member_name on true
    where classified_connections.category = p_category
  )
  select
    enriched_connections.user_id,
    enriched_connections.display_name,
    enriched_connections.shared_event_count,
    enriched_connections.active_shared_event_count,
    enriched_connections.latest_shared_at,
    enriched_connections.is_following,
    enriched_connections.is_followed_by,
    enriched_connections.is_favorite,
    enriched_connections.cursor_at,
    enriched_connections.cursor_user_id
  from enriched_connections
  where (
    p_cursor_at is null
    or p_cursor_user_id is null
    or enriched_connections.cursor_at < p_cursor_at
    or (enriched_connections.cursor_at = p_cursor_at and enriched_connections.cursor_user_id < p_cursor_user_id)
  )
  order by enriched_connections.cursor_at desc, enriched_connections.cursor_user_id desc
  limit v_limit;
end;
$$;
revoke all on function public.list_connections(text, timestamptz, uuid, integer) from public;
revoke all on function public.list_connections(text, timestamptz, uuid, integer) from anon;
grant execute on function public.list_connections(text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_connections(text, timestamptz, uuid, integer) to service_role;

create or replace function public.get_connection_counts()
returns table(category text, item_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  return query
  with shared_memberships as (
    select
      other_member.user_id,
      count(*)::bigint as shared_event_count,
      max(other_member.created_at) as latest_shared_at
    from public.event_members as current_member
    join public.event_members as other_member
      on other_member.event_id = current_member.event_id
      and other_member.status = 'joined'
    where current_member.user_id = v_actor
      and current_member.status = 'joined'
      and other_member.user_id <> v_actor
    group by other_member.user_id
  ),
  visible_shared_memberships as (
    select shared_memberships.*
    from shared_memberships
    where not exists (
      select 1
      from public.user_blocks as relationship_block
      where (
        relationship_block.blocker_user_id = v_actor
        and relationship_block.blocked_user_id = shared_memberships.user_id
      )
      or (
        relationship_block.blocker_user_id = shared_memberships.user_id
        and relationship_block.blocked_user_id = v_actor
      )
    )
  ),
  relation_state as (
    select
      visible_shared_memberships.user_id,
      visible_shared_memberships.shared_event_count,
      visible_shared_memberships.latest_shared_at,
      following.follower_user_id is not null as is_following,
      followed_by.follower_user_id is not null as is_followed_by,
      favorite.user_id is not null as is_favorite
    from visible_shared_memberships
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = visible_shared_memberships.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = visible_shared_memberships.user_id
      and followed_by.followed_user_id = v_actor
    left join public.user_favorites as favorite
      on favorite.user_id = v_actor
      and favorite.favorite_user_id = visible_shared_memberships.user_id
  ),
  classified_connections as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
      relation_state.is_favorite,
      relation_state.latest_shared_at as cursor_at,
      relation_state.user_id as cursor_user_id,
      case
        when relation_state.is_following and relation_state.is_followed_by then 'mutual'
        when relation_state.is_following then 'following'
        else 'shared'
      end as category
    from relation_state

    union all

    select
      blocked_user.blocked_user_id as user_id,
      coalesce(shared_memberships.shared_event_count, 0::bigint) as shared_event_count,
      shared_memberships.latest_shared_at,
      false as is_following,
      false as is_followed_by,
      false as is_favorite,
      blocked_user.created_at as cursor_at,
      blocked_user.blocked_user_id as cursor_user_id,
      'blocked'::text as category
    from public.user_blocks as blocked_user
    left join shared_memberships
      on shared_memberships.user_id = blocked_user.blocked_user_id
    where blocked_user.blocker_user_id = v_actor
  )
  select
    category_values.category,
    count(classified_connections.user_id)::bigint as item_count
  from (
    values
      ('favorites'::text, 1),
      ('mutual'::text, 2),
      ('following'::text, 3),
      ('shared'::text, 4),
      ('blocked'::text, 5)
  ) as category_values(category, ordinal)
  left join classified_connections
    on classified_connections.category = category_values.category
  group by category_values.category, category_values.ordinal
  order by category_values.ordinal;
end;
$$;
revoke all on function public.get_connection_counts() from public;
revoke all on function public.get_connection_counts() from anon;
grant execute on function public.get_connection_counts() to authenticated;
grant execute on function public.get_connection_counts() to service_role;

commit;
