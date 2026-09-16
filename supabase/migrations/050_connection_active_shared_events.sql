-- つながり画面の人物行に「進行中の共通イベント」を出すための基盤。
--
-- 「進行中」の判定は list_owned_event_ids（048）の lifecycle_finished /
-- settlement_state の計算と完全に同じにする。list_owned_event_ids 自体は
-- owner_user_id 起点のクエリなので、ここでは全イベント向けに計算する
-- ビューとして切り出す（list_connections と list_active_shared_events の
-- 2箇所から使うため、DRYにする）。

begin;

create or replace view public.event_activity_state as
with plan_state as (
  select
    p.event_id,
    count(*) as plan_count,
    bool_or(p.status not in ('cancelled', 'skipped')) as has_relevant_plan,
    bool_or(
      p.status not in ('cancelled', 'skipped')
      and (
        coalesce(p.confirmed_end_at, p.confirmed_start_at) is null
        or coalesce(p.confirmed_end_at, p.confirmed_start_at) >= now()
      )
    ) as has_unfinished_relevant_plan,
    bool_or(p.settlement_status = 'settling') as has_settling,
    bool_or(p.settlement_status = 'needed') as has_needed,
    bool_or(p.settlement_status = 'not_started') as has_not_started,
    bool_or(p.settlement_status = 'settled') as has_settled,
    bool_or(p.status = 'collecting_answers') as has_collecting_answers,
    bool_or(
      p.status not in ('cancelled', 'skipped')
      and p.confirmed_start_at is not null
      and p.confirmed_start_at > now()
    ) as has_upcoming_confirmed
  from public.plans as p
  group by p.event_id
),
event_state as (
  select
    e.id as event_id,
    e.status,
    coalesce(ps.has_collecting_answers, false) as has_collecting_answers,
    coalesce(ps.has_upcoming_confirmed, false) as has_upcoming_confirmed,
    case
      when e.status in ('done', 'cancelled', 'skipped') then true
      when coalesce(ps.has_relevant_plan, false) then not coalesce(ps.has_unfinished_relevant_plan, false)
      when coalesce(e.end_date, e.start_date) is null then false
      else (
        (coalesce(e.end_date, e.start_date) + 1)::timestamp at time zone 'Asia/Tokyo'
      ) <= now()
    end as lifecycle_finished,
    case
      when coalesce(ps.plan_count, 0) = 0 then 'not_needed'
      when coalesce(ps.has_settling, false) then 'settling'
      when coalesce(ps.has_needed, false) then 'needed'
      when e.status <> 'cancelled' and coalesce(ps.has_not_started, false) then 'not_started'
      when coalesce(ps.has_settled, false) then 'settled'
      else 'not_needed'
    end as settlement_state
  from public.events as e
  left join plan_state as ps on ps.event_id = e.id
)
select
  event_state.event_id,
  event_state.status,
  event_state.lifecycle_finished,
  event_state.settlement_state,
  (not event_state.lifecycle_finished or event_state.settlement_state not in ('not_needed', 'settled')) as is_active,
  case
    when event_state.lifecycle_finished and event_state.settlement_state not in ('not_needed', 'settled')
      then 'settlement_waiting'
    when event_state.status = 'cancelled' then 'cancelled'
    when event_state.lifecycle_finished then 'completed'
    when event_state.has_collecting_answers then 'answer_waiting'
    when event_state.has_upcoming_confirmed then 'event_waiting'
    when event_state.status = 'interested' then 'participant_waiting'
    else 'schedule_creation_waiting'
  end as display_state
from event_state;

-- PostgRESTの初期設定は新規リレーションにanon/authenticatedへのSELECTを自動付与するため、
-- このビューは下のsecurity definer RPC経由でのみ到達可能にする（032の関数版と同じ対処）。
revoke all on table public.event_activity_state from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 自分と相手の両方が現在も joined な、進行中の共通イベント一覧
-- ---------------------------------------------------------------------------

create or replace function public.list_active_shared_events(
  p_other_user_id uuid
)
returns table(
  event_id uuid,
  title text,
  display_state text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_other_user_id is null then
    raise exception 'p_other_user_id is required';
  end if;

  if exists (
    select 1
    from public.user_blocks as relationship_block
    where (
      relationship_block.blocker_user_id = v_actor
      and relationship_block.blocked_user_id = p_other_user_id
    )
    or (
      relationship_block.blocker_user_id = p_other_user_id
      and relationship_block.blocked_user_id = v_actor
    )
  ) then
    return;
  end if;

  return query
  select
    e.id as event_id,
    e.title,
    activity.display_state
  from public.event_members as my_membership
  join public.event_members as their_membership
    on their_membership.event_id = my_membership.event_id
    and their_membership.status = 'joined'
    and their_membership.user_id = p_other_user_id
  join public.events as e
    on e.id = my_membership.event_id
  join public.event_activity_state as activity
    on activity.event_id = e.id
  where my_membership.user_id = v_actor
    and my_membership.status = 'joined'
    and activity.is_active
  order by e.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_connections に active_shared_event_count を追加（戻り値の列が増えるので
-- create or replace ではなく drop してから作り直す）
-- ---------------------------------------------------------------------------

drop function if exists public.list_connections(text, timestamptz, uuid, integer);

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
        when relation_state.is_favorite then 'favorites'
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

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop function if exists public.list_connections(text, timestamptz, uuid, integer);
-- （その後、034時点の list_connections 定義を再適用する）
-- drop function if exists public.list_active_shared_events(uuid);
-- grant select on table public.event_activity_state to anon, authenticated;
-- drop view if exists public.event_activity_state;
