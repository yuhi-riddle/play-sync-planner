-- 本番のpublic.list_calendar_items(date)が034の初版のまま残っていたドリフトの修正。
--
-- 034は本番適用後にリポジトリで2回更新されたが、ファイルの変更だけでは本番に
-- 再適用されない。そのため場所が表示されず、確定済みプランが候補日ごとに重複していた。
--
-- 実際の影響:
--   - location_nameが返らず、ホームカレンダーにイベントの場所が表示されない。
--   - date_confirmedのプランがcandidate_datesの候補日ごとに表示される。
--
-- 034最終定義は戻り値の列が増えるため、関数をdropしてから再作成する。
-- dropでリセットされる権限は付け直す。
-- また、030はmark_plan_settlingの権限をpublicからのみ剥奪していた。Supabaseがanonに
-- 直接付与する既定のEXECUTE権限が残るため、anonからも剥奪する。

begin;

drop function if exists public.list_calendar_items(date);

create function public.list_calendar_items(
  p_month date
)
returns table(
  candidate_id uuid,
  plan_id uuid,
  event_title text,
  plan_title text,
  location_name text,
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
      event_row.location_name,
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
      event_row.location_name,
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
    schedule.location_name,
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
    schedule.location_name,
    schedule.start_at,
    schedule.end_at,
    schedule.is_all_day,
    schedule.status
  order by schedule.start_at asc, schedule.plan_id asc;
end;
$$;

revoke all on function public.list_calendar_items(date) from public;
revoke all on function public.list_calendar_items(date) from anon;
grant execute on function public.list_calendar_items(date) to authenticated;
grant execute on function public.list_calendar_items(date) to service_role;
revoke all on function public.mark_plan_settling(uuid) from anon;

commit;

-- ロールバック（今回の変更を戻す場合）:
--
-- public.list_calendar_items(date)を034初版の定義に戻して再適用する。
-- public.mark_plan_settling(uuid)のanon権限は、次のSQLで戻せる。
-- grant execute on function public.mark_plan_settling(uuid) to anon;
