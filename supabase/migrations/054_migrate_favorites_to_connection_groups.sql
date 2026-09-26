-- お気に入りを「お気に入り」グループへ移す。
-- 画面からお気に入りがなくなる PR①のアプリをデプロイした直後に本番へ適用する。
-- 適用順: 053 → アプリのデプロイ完了 → この migration 054。
-- 関数にしてあるので、適用後に作られたお気に入りがあっても、もう一度呼べば足りる。
-- user_favorites 自体は PR④で消すまで残す。

begin;

create or replace function private.migrate_favorites_to_connection_groups()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  -- 20グループの上限はここでは見ない（移行分は必ず作る）。
  insert into public.connection_groups (owner_user_id, name, color)
  select distinct favorite.user_id, 'お気に入り', 'nazotoki'
  from public.user_favorites as favorite
  on conflict (owner_user_id, name) do nothing;

  -- 30人の上限もここでは見ない。
  insert into public.connection_group_members (group_id, member_user_id)
  select favorite_group.id, favorite.favorite_user_id
  from public.user_favorites as favorite
  join public.connection_groups as favorite_group
    on favorite_group.owner_user_id = favorite.user_id
    and favorite_group.name = 'お気に入り'
  where private.is_connection_group_member_visible(favorite.user_id, favorite.favorite_user_id)
  on conflict (group_id, member_user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.migrate_favorites_to_connection_groups() from public;

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

select private.migrate_favorites_to_connection_groups();

commit;
