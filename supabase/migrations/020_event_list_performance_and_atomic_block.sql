create index if not exists events_owner_category_created_id_idx
on public.events(owner_user_id, category, created_at desc, id desc);

create index if not exists plans_event_status_confirmed_idx
on public.plans(event_id, status, confirmed_start_at, confirmed_end_at);

drop function if exists public.list_owned_event_ids(text, text, text, integer, integer);

create or replace function public.list_owned_event_ids(
  p_filter text default 'active',
  p_category text default 'all',
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset bigint default 0
)
returns table(event_ids uuid[], total_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with normalized as (
    select
      case when p_filter in ('active', 'cancelled', 'completed') then p_filter else 'active' end as filter_value,
      case
        when p_category in ('nazotoki', 'live', 'travel', 'drinking', 'snowboard', 'boardgame', 'movie_stage', 'other')
          then p_category
        else 'all'
      end as category_value,
      case when p_sort in ('newest', 'soonest', 'latest') then p_sort else 'newest' end as sort_value,
      case when p_limit in (10, 20, 50) then p_limit else 10 end as limit_value,
      greatest(coalesce(p_offset, 0::bigint), 0::bigint) as offset_value
  ),
  owned_events as (
    select e.*
    from public.events as e
    where e.owner_user_id = auth.uid()
  ),
  plan_state as (
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
      bool_or(p.settlement_status = 'settled') as has_settled
    from public.plans as p
    join owned_events as e on e.id = p.event_id
    group by p.event_id
  ),
  event_state as (
    select
      e.id,
      e.category,
      e.status,
      e.created_at,
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
      end as settlement_state,
      coalesce(
        (
          select p.confirmed_start_at
          from public.plans as p
          where p.event_id = e.id
            and p.confirmed_start_at is not null
            and coalesce(p.confirmed_end_at, p.confirmed_start_at) >= now()
          order by p.confirmed_start_at asc
          limit 1
        ),
        (
          select p.confirmed_start_at
          from public.plans as p
          where p.event_id = e.id
            and p.confirmed_start_at is not null
          order by p.confirmed_start_at desc
          limit 1
        ),
        e.start_date::timestamp at time zone 'Asia/Tokyo'
      ) as schedule_start
    from owned_events as e
    left join plan_state as ps on ps.event_id = e.id
  ),
  filtered as (
    select es.*, n.sort_value
    from event_state as es
    cross join normalized as n
    where (n.category_value = 'all' or es.category = n.category_value)
      and case n.filter_value
        when 'active' then not es.lifecycle_finished or es.settlement_state not in ('not_needed', 'settled')
        when 'cancelled' then es.status = 'cancelled'
        when 'completed' then es.status <> 'cancelled'
          and es.lifecycle_finished
          and es.settlement_state in ('not_needed', 'settled')
        else false
      end
  ),
  ordered as (
    select
      id,
      row_number() over (
        order by
          case when sort_value = 'newest' then created_at end desc nulls last,
          case when sort_value = 'soonest' then schedule_start end asc nulls last,
          case when sort_value = 'latest' then schedule_start end desc nulls last,
          created_at desc,
          id desc
      ) as ordinal
    from filtered
  )
  select
    coalesce(
      (
        select array_agg(id order by ordinal)
        from ordered
        cross join normalized
        where ordinal > offset_value
          and ordinal <= offset_value + limit_value::bigint
      ),
      '{}'::uuid[]
    ) as event_ids,
    (select count(*)::bigint from ordered) as total_count;
$$;

create or replace function public.block_user_atomic(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
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
end;
$$;

revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint) from public;
revoke all on function public.block_user_atomic(uuid) from public;
grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint) to authenticated;
grant execute on function public.block_user_atomic(uuid) to authenticated;
