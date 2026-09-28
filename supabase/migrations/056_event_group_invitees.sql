begin;

-- イベント詳細の「Madoiで招待」で、グループのボタンから招待できる人を出す。
-- 設計: docs/superpowers/specs/2026-09-25-connection-groups-design.md

create function public.list_event_group_invitees(p_event_id uuid)
returns table(
  group_id uuid,
  group_name text,
  group_color text,
  group_member_count bigint,
  user_id uuid,
  display_name text,
  shared_event_count bigint,
  is_following boolean
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

  if not exists (
    select 1 from public.events as owned_event
    where owned_event.id = p_event_id and owned_event.owner_user_id = v_actor
  ) then
    raise exception 'Event owner required';
  end if;

  return query
  with visible_members as (
    select owned.id as group_id, owned.name, owned.color, owned.created_at, member.member_user_id
    from public.connection_groups as owned
    join public.connection_group_members as member on member.group_id = owned.id
    where owned.owner_user_id = v_actor
      and private.is_connection_group_member_visible(v_actor, member.member_user_id)
  ),
  group_sizes as (
    select visible_members.group_id, visible_members.name, visible_members.color, visible_members.created_at,
      count(*)::bigint as member_count
    from visible_members
    group by visible_members.group_id, visible_members.name, visible_members.color, visible_members.created_at
  ),
  invitable as (
    select visible_members.group_id, visible_members.member_user_id
    from visible_members
    where (
        public.have_shared_event(v_actor, visible_members.member_user_id)
        or exists (
          select 1 from public.user_connections as following
          where following.follower_user_id = v_actor
            and following.followed_user_id = visible_members.member_user_id
        )
      )
      and not exists (
        select 1 from public.event_members as joined_member
        where joined_member.event_id = p_event_id
          and joined_member.user_id = visible_members.member_user_id
          and joined_member.status = 'joined'
      )
      and not exists (
        select 1 from public.event_user_invitations as invitation
        where invitation.event_id = p_event_id
          and invitation.invitee_user_id = visible_members.member_user_id
          and invitation.status in ('pending', 'accepted')
      )
  )
  select
    group_sizes.group_id,
    group_sizes.name,
    group_sizes.color,
    group_sizes.member_count,
    invitable.member_user_id,
    case when invitable.member_user_id is null then null
      else private.connection_display_name(invitable.member_user_id) end,
    case when invitable.member_user_id is null then null
      else (
        select count(*)
        from public.event_members as mine
        join public.event_members as theirs
          on theirs.event_id = mine.event_id
          and theirs.status = 'joined'
          and theirs.user_id = invitable.member_user_id
        where mine.user_id = v_actor and mine.status = 'joined'
      )::bigint end,
    case when invitable.member_user_id is null then null
      else exists (
        select 1 from public.user_connections as following
        where following.follower_user_id = v_actor
          and following.followed_user_id = invitable.member_user_id
      ) end
  from group_sizes
  left join invitable on invitable.group_id = group_sizes.group_id
  order by group_sizes.created_at, group_sizes.group_id, invitable.member_user_id;
end;
$$;

revoke all on function public.list_event_group_invitees(uuid) from public;
revoke all on function public.list_event_group_invitees(uuid) from anon;
grant execute on function public.list_event_group_invitees(uuid) to authenticated;
grant execute on function public.list_event_group_invitees(uuid) to service_role;

create or replace function public.create_event_user_invitations(
  p_event_id uuid,
  p_invitee_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_invitee_user_ids uuid[];
  event_title text;
  -- 列の invitee_user_id と同じ名前だと「すでに招待済みか」の条件で 42702（どちらか決まらない）になり、
  -- 招待が毎回失敗していた。変数の名前を変えて区別する。
  v_invitee_user_id uuid;
  created_count integer;
  retry_seconds integer;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  retry_seconds := private.try_consume_authenticated_rate_limit_once('event_invitation_create');
  if retry_seconds > 0 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', retry_seconds);
  end if;

  -- 権限確認を入力内容の検証より先にする。非オーナーが自分自身を招待先に
  -- 含めて叩いてきた場合、以前は requireInvitationOwner() が真っ先にオーナー
  -- 確認をしていたため常に「権限がありません」だった。順序を入れ替えたままだと
  -- 権限が無い呼び出し元にも「入力のどこが変か」という情報が先に漏れてしまう。
  if not public.is_event_owner(p_event_id) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'not_owner');
  end if;

  -- グループ（最大30人）をまとめて招待できるよう、上限をグループの上限にそろえる。
  if cardinality(p_invitee_user_ids) not between 1 and 30 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'invalid_input');
  end if;

  select array_agg(distinct candidate)
  into normalized_invitee_user_ids
  from unnest(p_invitee_user_ids) as candidate
  where candidate is not null;

  if coalesce(cardinality(normalized_invitee_user_ids), 0) = 0 then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'empty_selection');
  end if;

  if current_user_id = any(normalized_invitee_user_ids) then
    insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
    values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
    return jsonb_build_object('ok', false, 'error', 'self_invite');
  end if;

  select public.events.title
  into event_title
  from public.events
  where public.events.id = p_event_id;

  foreach v_invitee_user_id in array normalized_invitee_user_ids loop
    if public.is_user_blocked(current_user_id, v_invitee_user_id) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'blocked');
    end if;

    if not (
      public.have_shared_event(current_user_id, v_invitee_user_id)
      or exists (
        select 1
        from public.user_connections
        where public.user_connections.follower_user_id = current_user_id
          and public.user_connections.followed_user_id = v_invitee_user_id
      )
      or exists (
        select 1
        from public.user_favorites
        where public.user_favorites.user_id = current_user_id
          and public.user_favorites.favorite_user_id = v_invitee_user_id
      )
    ) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'not_eligible');
    end if;

    if exists (
      select 1
      from public.event_members
      where public.event_members.event_id = p_event_id
        and public.event_members.user_id = v_invitee_user_id
        and public.event_members.status = 'joined'
    ) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'already_member');
    end if;

    if exists (
      select 1
      from public.event_user_invitations
      where public.event_user_invitations.event_id = p_event_id
        and public.event_user_invitations.invitee_user_id = v_invitee_user_id
        and public.event_user_invitations.status in ('pending', 'accepted')
    ) then
      insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
      values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'denied');
      return jsonb_build_object('ok', false, 'error', 'already_invited');
    end if;
  end loop;

  insert into public.event_user_invitations (event_id, inviter_user_id, invitee_user_id, status)
  select p_event_id, current_user_id, candidate, 'pending'
  from unnest(normalized_invitee_user_ids) as candidate;
  get diagnostics created_count = row_count;

  -- notifications.updated_at は before update トリガー（013）が自動で埋める。
  insert into public.notifications (user_id, kind, title, body, href, dedupe_key, read_at)
  select
    candidate,
    'event_invitation',
    event_title || ' に招待されました',
    'Madoiでイベントへの招待が届いています。',
    '/connections',
    'event-invitation:' || p_event_id::text || ':' || candidate::text,
    null
  from unnest(normalized_invitee_user_ids) as candidate
  on conflict (user_id, dedupe_key)
  do update set
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    read_at = null;

  insert into private.security_audit_logs (actor_user_id, operation, target_type, target_id, outcome)
  values (current_user_id, 'event_invitation_create', 'event', p_event_id, 'success');

  return jsonb_build_object('ok', true, 'created_count', created_count);
end;
$$;

revoke all on function public.create_event_user_invitations(uuid, uuid[]) from public, anon;
grant execute on function public.create_event_user_invitations(uuid, uuid[]) to authenticated;

commit;
