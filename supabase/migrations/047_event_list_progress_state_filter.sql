-- イベント一覧の絞り込みに「進行状態」を足す。
--
-- いままで list_owned_event_ids は active / cancelled / completed の3値でしか絞れなかった。
-- カードのバッジ（lib/domain/event/event-filter.ts の getEventDisplayState）が出している
-- 参加者待ち / 日程作成待ち / 回答待ち / 開催待ち / 清算待ち でも絞れるようにする。
-- ページング・件数は RPC の中で完結しているので、状態計算も RPC に持たせる必要がある。
--
-- CASE の分岐は getEventDisplayState と条件・順序を完全一致させる。ズレると
-- カードのバッジと絞り込み結果が食い違う。tests/db/event-list-progress-state.test.ts が
-- 実DB上で両者の一致を検証する。
--
-- 引数を1つ増やすので create or replace では差し替えられない。先に旧シグネチャを落とす
-- （マイグレーションはトランザクション内なので、関数が消えている瞬間は外から見えない）。
-- 新しい7引数関数は6引数呼び出しとも互換（p_display_state に default 'all'）なので、
-- このマイグレーションを本番に適用したあと、旧コード（6引数呼び出し）はそのまま動く。
drop function if exists public.list_owned_event_ids(text, text, text, integer, bigint, text);

create or replace function public.list_owned_event_ids(
  p_filter text default 'active',
  p_category text default 'all',
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset bigint default 0,
  p_query text default null,
  p_display_state text default 'all'
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
      greatest(coalesce(p_offset, 0::bigint), 0::bigint) as offset_value,
      -- ilike のワイルドカードを潰す。潰さないと「%」の1文字で全件一致になる。
      -- 逆順に置換するとエスケープ用の \ 自身をもう一度エスケープしてしまうので、\ を先に処理する。
      case
        when nullif(btrim(coalesce(p_query, '')), '') is null then null
        else replace(replace(replace(left(btrim(p_query), 100), '\', '\\'), '%', '\%'), '_', '\_')
      end as query_value,
      -- 進行状態フィルタ。受けるのは「進行中」の内訳5つだけ。
      -- completed / cancelled は p_filter 側の担当なので、ここでは絞らない
      -- （p_filter='active' と組み合わさると必ず空になり意味がない）。
      case
        when p_display_state in (
          'participant_waiting', 'schedule_creation_waiting', 'answer_waiting',
          'event_waiting', 'settlement_waiting'
        ) then p_display_state
        else 'all'
      end as display_state_value
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
      bool_or(p.settlement_status = 'settled') as has_settled,
      -- getEventDisplayState の分岐4: collecting_answers の plan があるか
      bool_or(p.status = 'collecting_answers') as has_collecting_answers,
      -- getEventDisplayState の分岐5: hasUpcomingConfirmedSchedule のミラー。
      -- confirmed_start_at は timestamptz なので TS の startOfScheduleTimestamp は素通しで、
      -- 実質 confirmed_start_at > now と同値。cancelled/skipped の plan は除く。
      bool_or(
        p.status not in ('cancelled', 'skipped')
        and p.confirmed_start_at is not null
        and p.confirmed_start_at > now()
      ) as has_upcoming_confirmed
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
      e.title,
      e.location_name,
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
  event_display as (
    -- lifecycle_finished / settlement_state は event_state の同じ SELECT 内で計算しているので、
    -- 兄弟カラムを参照できない。1段かぶせて display_state を出す。
    -- 分岐は getEventDisplayState（lib/domain/event/event-filter.ts）と完全に同じ順序。
    select
      es.*,
      case
        when es.lifecycle_finished and es.settlement_state not in ('not_needed', 'settled')
          then 'settlement_waiting'
        when es.status = 'cancelled' then 'cancelled'
        when es.lifecycle_finished then 'completed'
        when es.has_collecting_answers then 'answer_waiting'
        when es.has_upcoming_confirmed then 'event_waiting'
        when es.status = 'interested' then 'participant_waiting'
        else 'schedule_creation_waiting'
      end as display_state
    from event_state as es
  ),
  filtered as (
    select ed.*, n.sort_value
    from event_display as ed
    cross join normalized as n
    where (n.category_value = 'all' or ed.category = n.category_value)
      and (
        n.query_value is null
        or ed.title ilike '%' || n.query_value || '%'
        or coalesce(ed.location_name, '') ilike '%' || n.query_value || '%'
      )
      and case n.filter_value
        when 'active' then not ed.lifecycle_finished or ed.settlement_state not in ('not_needed', 'settled')
        when 'cancelled' then ed.status = 'cancelled'
        when 'completed' then ed.status <> 'cancelled'
          and ed.lifecycle_finished
          and ed.settlement_state in ('not_needed', 'settled')
        else false
      end
      and (n.display_state_value = 'all' or ed.display_state = n.display_state_value)
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

revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) from public;
revoke all on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) from anon;
grant execute on function public.list_owned_event_ids(text, text, text, integer, bigint, text, text) to authenticated;

-- ロールバック（この変更を戻す場合はこれを実行する）:
--
-- drop function if exists public.list_owned_event_ids(text, text, text, integer, bigint, text, text);
-- （そのうえで migration 029 の関数本体を再作成し、
--   revoke all ... (text, text, text, integer, bigint, text) from public;
--   grant execute ... (text, text, text, integer, bigint, text) to authenticated; を張り直す）
