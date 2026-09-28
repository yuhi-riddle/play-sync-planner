begin;

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

  perform private.lock_connection_pair(current_user_id, target_user_id);

  insert into public.user_blocks (blocker_user_id, blocked_user_id)
  values (current_user_id, target_user_id)
  on conflict (blocker_user_id, blocked_user_id) do nothing;

  delete from public.user_connections
  where (follower_user_id = current_user_id and followed_user_id = target_user_id)
     or (follower_user_id = target_user_id and followed_user_id = current_user_id);


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
      followed_by.follower_user_id is not null as is_followed_by
    from visible_shared_memberships
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = visible_shared_memberships.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = visible_shared_memberships.user_id
      and followed_by.followed_user_id = v_actor
  ),
  classified_connections as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
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

drop function if exists public.list_connections(text, timestamptz, uuid, integer);

create function public.list_connections(
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
    or p_category not in ('mutual', 'following', 'shared', 'blocked') then
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
      followed_by.follower_user_id is not null as is_followed_by
    from visible_shared_memberships
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = visible_shared_memberships.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = visible_shared_memberships.user_id
      and followed_by.followed_user_id = v_actor
  ),
  classified_connections as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.active_shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
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

drop function if exists public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer);

create function public.list_event_invite_candidates(
  p_event_id uuid,
  p_query text,
  p_cursor_at timestamptz,
  p_cursor_user_id uuid,
  p_limit integer
)
returns table(
  user_id uuid,
  display_name text,
  shared_event_count bigint,
  latest_shared_at timestamptz,
  is_following boolean,
  is_followed_by boolean,
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
  v_query text := nullif(btrim(left(coalesce(p_query, ''), 100)), '');
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.events
    where public.events.id = p_event_id
      and public.events.owner_user_id = v_actor
  ) then
    raise exception 'Event owner required';
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
  candidate_user_ids as (
    select shared_memberships.user_id
    from shared_memberships

    union

    select following.followed_user_id
    from public.user_connections as following
    where following.follower_user_id = v_actor
  ),
  relation_state as (
    select
      candidate_user_ids.user_id,
      coalesce(shared_memberships.shared_event_count, 0::bigint) as shared_event_count,
      shared_memberships.latest_shared_at,
      following.follower_user_id is not null as is_following,
      followed_by.follower_user_id is not null as is_followed_by,
      following.created_at as following_created_at
    from candidate_user_ids
    left join shared_memberships
      on shared_memberships.user_id = candidate_user_ids.user_id
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = candidate_user_ids.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = candidate_user_ids.user_id
      and followed_by.followed_user_id = v_actor
  ),
  eligible_candidates as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
      coalesce(
        relation_state.latest_shared_at,
        relation_state.following_created_at
      ) as cursor_at,
      relation_state.user_id as cursor_user_id
    from relation_state
    where relation_state.user_id <> v_actor
      and not exists (
        select 1
        from public.event_members as candidate_member
        where candidate_member.event_id = p_event_id
          and candidate_member.user_id = relation_state.user_id
          and candidate_member.status = 'joined'
      )
      and not exists (
        select 1
        from public.user_blocks as relationship_block
        where (
          relationship_block.blocker_user_id = v_actor
          and relationship_block.blocked_user_id = relation_state.user_id
        )
        or (
          relationship_block.blocker_user_id = relation_state.user_id
          and relationship_block.blocked_user_id = v_actor
        )
      )
  ),
  enriched_candidates as (
    select
      eligible_candidates.user_id,
      coalesce(nullif(btrim(profile.nickname), ''), nullif(btrim(member_name.display_name), ''), 'Madoiユーザー') as display_name,
      eligible_candidates.shared_event_count,
      eligible_candidates.latest_shared_at,
      eligible_candidates.is_following,
      eligible_candidates.is_followed_by,
      eligible_candidates.cursor_at,
      eligible_candidates.cursor_user_id
    from eligible_candidates
    left join public.profiles as profile
      on profile.user_id = eligible_candidates.user_id
    left join lateral (
      select event_member.display_name
      from public.event_members as event_member
      where event_member.user_id = eligible_candidates.user_id
      order by event_member.created_at desc, event_member.event_id desc
      limit 1
    ) as member_name on true
  )
  select
    enriched_candidates.user_id,
    enriched_candidates.display_name,
    enriched_candidates.shared_event_count,
    enriched_candidates.latest_shared_at,
    enriched_candidates.is_following,
    enriched_candidates.is_followed_by,
    enriched_candidates.cursor_at,
    enriched_candidates.cursor_user_id
  from enriched_candidates
  where (
    v_query is null
    or enriched_candidates.display_name ilike '%' || v_query || '%'
  )
  and (
    p_cursor_at is null
    or p_cursor_user_id is null
    or enriched_candidates.cursor_at < p_cursor_at
    or (enriched_candidates.cursor_at = p_cursor_at and enriched_candidates.cursor_user_id < p_cursor_user_id)
  )
  order by enriched_candidates.cursor_at desc, enriched_candidates.cursor_user_id desc
  limit v_limit;
end;
$$;
revoke all on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) from public;
revoke all on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) from anon;
grant execute on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) to service_role;

drop function if exists public.toggle_favorite_atomic(uuid);

drop function if exists private.migrate_favorites_to_connection_groups();

drop table if exists public.user_favorites;

commit;
