-- グループ画面の「進めているイベント」と「最近おわったイベント」。
-- 設計: docs/superpowers/specs/2026-09-25-connection-groups-design.md

begin;

create function public.list_connection_group_events(p_group_id uuid)
returns table(
  event_id uuid,
  title text,
  display_state text,
  is_active boolean,
  member_count bigint,
  group_member_count bigint
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
    select 1 from public.connection_groups as owned
    where owned.id = p_group_id and owned.owner_user_id = v_actor
  ) then
    return;
  end if;

  return query
  with visible_members as (
    select member.member_user_id
    from public.connection_group_members as member
    where member.group_id = p_group_id
      and private.is_connection_group_member_visible(v_actor, member.member_user_id)
  ),
  shared as (
    select mine.event_id, count(distinct theirs.user_id)::bigint as member_count
    from public.event_members as mine
    join public.event_members as theirs
      on theirs.event_id = mine.event_id
      and theirs.status = 'joined'
    join visible_members
      on visible_members.member_user_id = theirs.user_id
    where mine.user_id = v_actor
      and mine.status = 'joined'
    group by mine.event_id
  ),
  group_events as (
    select
      e.id,
      e.title,
      activity.display_state,
      activity.is_active,
      shared.member_count,
      e.start_date,
      e.end_date,
      e.created_at
    from shared
    join public.events as e on e.id = shared.event_id
    join public.event_activity_state as activity on activity.event_id = e.id
  ),
  finished_events as (
    select group_events.*
    from group_events
    where not group_events.is_active
    order by coalesce(group_events.end_date, group_events.start_date) desc nulls last, group_events.created_at desc
    limit 5
  ),
  picked as (
    select group_events.*, 0 as bucket from group_events where group_events.is_active
    union all
    select finished_events.*, 1 as bucket from finished_events
  )
  select
    picked.id,
    picked.title,
    picked.display_state,
    picked.is_active,
    picked.member_count,
    (select count(*) from visible_members)::bigint
  from picked
  order by
    picked.bucket,
    case when picked.bucket = 0 then picked.start_date end asc nulls last,
    case when picked.bucket = 1 then coalesce(picked.end_date, picked.start_date) end desc nulls last,
    picked.created_at desc;
end;
$$;

revoke all on function public.list_connection_group_events(uuid) from public;
revoke all on function public.list_connection_group_events(uuid) from anon;
grant execute on function public.list_connection_group_events(uuid) to authenticated;
grant execute on function public.list_connection_group_events(uuid) to service_role;

commit;
