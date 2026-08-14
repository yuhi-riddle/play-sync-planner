-- つながり・招待候補・カレンダーのページ表示を、都度のペア判定RPC連打から
-- カーソルページング済みの集約RPCへ移す。索引7本 + RPC5本 + ポリシー2本。
--
-- wip/legacy-helper-test の 022_page_query_performance.sql を移植したもの
-- （docs/codex-branch-triage.md「取り込みの順番（案）」4番目）。移植にあたり、
-- private.is_event_owner / private.is_joined_event_member への参照は
-- public.is_event_owner / public.is_joined_event_member に読み替えている
-- （main では 021 相当の private スキーマ移設をまだ行っていないため。
-- 015_fix_event_policy_recursion.sql で public スキーマに定義済み）。
--
-- このマイグレーションは索引・関数・ポリシーの追加のみで、アプリケーション側の
-- 呼び出し切り替え（lib/actions/account/connections.ts 等）は含まない。
-- 既存の have_shared_event / is_user_blocked を都度呼ぶ実装は当面残ったままになる
-- （取り込みの順番（案）5番目、別スライスで対応）。

begin;

create index if not exists event_messages_event_id_created_at_id_idx
on public.event_messages(event_id, created_at desc, id desc);

create index if not exists event_members_user_status_created_event_idx
on public.event_members(user_id, status, created_at desc, event_id desc);

create index if not exists event_members_event_status_user_created_idx
on public.event_members(event_id, status, user_id, created_at desc);

create index if not exists user_connections_followed_follower_idx
on public.user_connections(followed_user_id, follower_user_id);

create index if not exists user_blocks_blocker_created_blocked_idx
on public.user_blocks(blocker_user_id, created_at desc, blocked_user_id desc);

create index if not exists event_user_invitations_invitee_status_created_id_idx
on public.event_user_invitations(invitee_user_id, status, created_at desc, id desc);

create index if not exists candidate_dates_plan_start_end_idx
on public.candidate_dates(plan_id, start_at, end_at);

-- ---------------------------------------------------------------------------
-- つながり一覧（お気に入り/相互/フォロー中/共有イベントのみ/ブロック中）の件数
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- つながり一覧のカーソルページング取得（1カテゴリ、最大20件ずつ）
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 自分宛ての未応答イベント招待（最大20件）
-- ---------------------------------------------------------------------------

create or replace function public.list_received_event_invitations(
  p_limit integer
)
returns table(
  invitation_id uuid,
  event_id uuid,
  event_title text,
  organizer_name text,
  created_at timestamptz
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

  return query
  select
    invitation.id as invitation_id,
    invitation.event_id,
    coalesce(nullif(btrim(event_row.title), ''), 'イベント') as event_title,
    coalesce(nullif(btrim(organizer_profile.nickname), ''), nullif(btrim(organizer_member_name.display_name), ''), 'Madoiユーザー') as organizer_name,
    invitation.created_at
  from public.event_user_invitations as invitation
  join public.events as event_row
    on event_row.id = invitation.event_id
  left join public.profiles as organizer_profile
    on organizer_profile.user_id = invitation.inviter_user_id
  left join lateral (
    select organizer_member.display_name
    from public.event_members as organizer_member
    where organizer_member.user_id = invitation.inviter_user_id
    order by organizer_member.created_at desc, organizer_member.event_id desc
    limit 1
  ) as organizer_member_name on true
  where invitation.invitee_user_id = v_actor
    and invitation.status = 'pending'
  order by invitation.created_at desc, invitation.id desc
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- カレンダー表示月（前後バッファ込み）の候補日一覧と回答集計
-- ---------------------------------------------------------------------------

create or replace function public.list_calendar_items(
  p_month date
)
returns table(
  candidate_id uuid,
  plan_id uuid,
  event_title text,
  plan_title text,
  start_at timestamptz,
  end_at timestamptz,
  is_all_day boolean,
  status text,
  yes_count bigint,
  maybe_count bigint,
  no_count bigint,
  unanswered_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_month_start date;
  v_range_start timestamptz;
  v_range_end timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if p_month is null then
    raise exception 'Month required';
  end if;

  v_month_start := date_trunc('month', p_month)::date;
  v_range_start := (v_month_start - 6)::timestamp at time zone 'Asia/Tokyo';
  v_range_end := ((v_month_start + interval '1 month')::date + 7)::timestamp at time zone 'Asia/Tokyo';

  -- draft/collecting_answers は候補日ごとに1行。date_confirmed は
  -- plan.confirmed_start_at/confirmed_end_at（lib/actions/plan/confirm.ts が
  -- 確定時に candidate_dates から複製する列）を使って1planにつき1行だけ返す。
  -- candidate_dates を date_confirmed のままjoinすると、確定後も残っている
  -- 他の候補日（落選分）まで別の予定として重複表示されてしまうため。
  return query
  with schedule as (
    select
      candidate.id as candidate_id,
      plan.id as plan_id,
      event_row.title as event_title,
      plan.title as plan_title,
      candidate.start_at,
      candidate.end_at,
      candidate.is_all_day,
      plan.status
    from public.event_members as membership
    join public.events as event_row
      on event_row.id = membership.event_id
    join public.plans as plan
      on plan.event_id = event_row.id
    join public.candidate_dates as candidate
      on candidate.plan_id = plan.id
    where membership.user_id = v_actor
      and membership.status = 'joined'
      and plan.status in ('draft', 'collecting_answers')
      and candidate.start_at < v_range_end
      and coalesce(candidate.end_at, candidate.start_at) >= v_range_start

    union all

    select
      null::uuid as candidate_id,
      plan.id as plan_id,
      event_row.title as event_title,
      plan.title as plan_title,
      plan.confirmed_start_at as start_at,
      plan.confirmed_end_at as end_at,
      plan.is_all_day,
      plan.status
    from public.event_members as membership
    join public.events as event_row
      on event_row.id = membership.event_id
    join public.plans as plan
      on plan.event_id = event_row.id
    where membership.user_id = v_actor
      and membership.status = 'joined'
      and plan.status = 'date_confirmed'
      and plan.confirmed_start_at is not null
      and plan.confirmed_start_at < v_range_end
      and coalesce(plan.confirmed_end_at, plan.confirmed_start_at) >= v_range_start
  )
  select
    schedule.candidate_id,
    schedule.plan_id,
    schedule.event_title,
    schedule.plan_title,
    schedule.start_at,
    schedule.end_at,
    schedule.is_all_day,
    schedule.status,
    count(answer.id) filter (where answer.answer = 'yes') as yes_count,
    count(answer.id) filter (where answer.answer = 'maybe') as maybe_count,
    count(answer.id) filter (where answer.answer = 'no') as no_count,
    count(answer.id) filter (where answer.answer = 'unanswered') as unanswered_count
  from schedule
  left join public.availability_answers as answer
    on answer.candidate_date_id = schedule.candidate_id
  group by
    schedule.candidate_id,
    schedule.plan_id,
    schedule.event_title,
    schedule.plan_title,
    schedule.start_at,
    schedule.end_at,
    schedule.is_all_day,
    schedule.status
  order by schedule.start_at asc, schedule.plan_id asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- イベントへの招待候補（共有イベント/フォロー中/お気に入りが対象、既参加者・
-- ブロック関係・自分自身は除外）。イベントオーナー限定。
-- ---------------------------------------------------------------------------

create or replace function public.list_event_invite_candidates(
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

    union

    select favorite.favorite_user_id
    from public.user_favorites as favorite
    where favorite.user_id = v_actor
  ),
  relation_state as (
    select
      candidate_user_ids.user_id,
      coalesce(shared_memberships.shared_event_count, 0::bigint) as shared_event_count,
      shared_memberships.latest_shared_at,
      following.follower_user_id is not null as is_following,
      followed_by.follower_user_id is not null as is_followed_by,
      favorite.user_id is not null as is_favorite,
      following.created_at as following_created_at,
      favorite.created_at as favorite_created_at
    from candidate_user_ids
    left join shared_memberships
      on shared_memberships.user_id = candidate_user_ids.user_id
    left join public.user_connections as following
      on following.follower_user_id = v_actor
      and following.followed_user_id = candidate_user_ids.user_id
    left join public.user_connections as followed_by
      on followed_by.follower_user_id = candidate_user_ids.user_id
      and followed_by.followed_user_id = v_actor
    left join public.user_favorites as favorite
      on favorite.user_id = v_actor
      and favorite.favorite_user_id = candidate_user_ids.user_id
  ),
  eligible_candidates as (
    select
      relation_state.user_id,
      relation_state.shared_event_count,
      relation_state.latest_shared_at,
      relation_state.is_following,
      relation_state.is_followed_by,
      relation_state.is_favorite,
      coalesce(
        relation_state.latest_shared_at,
        relation_state.following_created_at,
        relation_state.favorite_created_at
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
      eligible_candidates.is_favorite,
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
    enriched_candidates.is_favorite,
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

revoke all on function public.get_connection_counts() from public;
revoke all on function public.get_connection_counts() from anon;
grant execute on function public.get_connection_counts() to authenticated;
grant execute on function public.get_connection_counts() to service_role;

revoke all on function public.list_connections(text, timestamptz, uuid, integer) from public;
revoke all on function public.list_connections(text, timestamptz, uuid, integer) from anon;
grant execute on function public.list_connections(text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_connections(text, timestamptz, uuid, integer) to service_role;

revoke all on function public.list_received_event_invitations(integer) from public;
revoke all on function public.list_received_event_invitations(integer) from anon;
grant execute on function public.list_received_event_invitations(integer) to authenticated;
grant execute on function public.list_received_event_invitations(integer) to service_role;

revoke all on function public.list_calendar_items(date) from public;
revoke all on function public.list_calendar_items(date) from anon;
grant execute on function public.list_calendar_items(date) to authenticated;
grant execute on function public.list_calendar_items(date) to service_role;

revoke all on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) from public;
revoke all on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) from anon;
grant execute on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) to authenticated;
grant execute on function public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- list_calendar_items / list_event_invite_candidates は「同じイベントの
-- 参加済みメンバー」を根拠に event_members / plans を読む。既存のRLSは
-- event_members が「自分の行のみ」（014）、plans が「plan単位の参加者
-- （participantsテーブル基準、030）」に閉じているため、このままでは
-- 上記2関数が他メンバーの行・他人が参加していないplanを読めない。
--
-- そこで「同じイベントに参加済みのメンバーは、そのイベントの他メンバー行と
-- plan一覧を見られる」ポリシーを追加する。plans側は030の
-- 「participantsテーブルに自分の行があるplanが見える」という基準とは別に、
-- 「event_membersでjoined状態のイベントのplanが見える」という基準を追加で
-- 許可することになる（RLSは許可ポリシーのOR結合なので壊れないが、
-- plan閲覧可否の判定基準が二重になる点はdocs/codex-branch-triage.mdに
-- 記録済みの既知のトレードオフ）。
-- ---------------------------------------------------------------------------

create policy "Joined members can view event members"
on public.event_members
for select
to authenticated
using (
  public.is_event_owner(event_id)
  or public.is_joined_event_member(event_id)
);

create policy "Joined members can view plans"
on public.plans
for select
to authenticated
using (
  public.is_event_owner(event_id)
  or public.is_joined_event_member(event_id)
);

commit;

-- ロールバック（今回の変更をすべて戻す場合はこれを実行する）:
--
-- drop policy if exists "Joined members can view plans" on public.plans;
-- drop policy if exists "Joined members can view event members" on public.event_members;
-- drop function if exists public.list_event_invite_candidates(uuid, text, timestamptz, uuid, integer);
-- drop function if exists public.list_calendar_items(date);
-- drop function if exists public.list_received_event_invitations(integer);
-- drop function if exists public.list_connections(text, timestamptz, uuid, integer);
-- drop function if exists public.get_connection_counts();
-- drop index if exists public.candidate_dates_plan_start_end_idx;
-- drop index if exists public.event_user_invitations_invitee_status_created_id_idx;
-- drop index if exists public.user_blocks_blocker_created_blocked_idx;
-- drop index if exists public.user_connections_followed_follower_idx;
-- drop index if exists public.event_members_event_status_user_created_idx;
-- drop index if exists public.event_members_user_status_created_event_idx;
-- drop index if exists public.event_messages_event_id_created_at_id_idx;
