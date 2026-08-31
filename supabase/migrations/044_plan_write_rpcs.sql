-- 日程調整の作成・日程編集を、1 トランザクション・plan 行ロック下で行う RPC。
--
-- これまで lib/actions/plan/plans.ts は
--   作成: plans insert → participants / candidate_dates / share_links / plan_reminder_settings を Promise.all で insert
--   編集: plans update → availability_answers delete → candidate_dates delete → candidate_dates insert
-- を別々の DB 操作で実行していた。
--   作成で子の insert が 1 つ失敗すると plan 行と一部の子だけ残る。
--   編集で candidate_dates の再 insert が失敗すると、旧候補日と回答が消えた状態でエラーになる。
--
-- ドメインのチェック（主催者を含むか等）と親切なエラーメッセージは呼び出し側 (TS) に残す。
-- ここでは「まとめて書く／まとめてやり直す」ことだけを保証する。

-- ---------------------------------------------------------------------------
-- create_plan_with_children
--   p_participants: [{"user_id","display_name","participant_type","status","is_organizer"}, ...]
--   p_candidate_dates: [{"start_at","end_at","is_all_day","sort_order"}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_plan_with_children(
  p_event_id uuid,
  p_title text,
  p_answer_deadline_at timestamptz,
  p_memo text,
  p_participants jsonb,
  p_candidate_dates jsonb,
  p_share_token text,
  p_share_expires_at timestamptz,
  p_reminder_offset_minutes integer,
  p_reminder_offsets_minutes integer[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
begin
  if not exists (
    select 1 from public.event_members
    where event_id = p_event_id
      and user_id = auth.uid()
      and role = 'organizer'
      and status = 'joined'
  ) then
    raise exception '主催者だけが日程調整を作成できます';
  end if;

  insert into public.plans (
    event_id, owner_user_id, title, answer_deadline_at, memo,
    status, settlement_status, ticket_status
  )
  values (
    p_event_id, auth.uid(), p_title, p_answer_deadline_at, p_memo,
    'collecting_answers', 'not_started', 'not_purchased'
  )
  returning id into v_plan_id;

  insert into public.participants (plan_id, user_id, display_name, participant_type, status, is_organizer)
  select
    v_plan_id,
    nullif(elem->>'user_id', '')::uuid,
    elem->>'display_name',
    coalesce(elem->>'participant_type', 'registered'),
    coalesce(elem->>'status', 'invited'),
    coalesce((elem->>'is_organizer')::boolean, false)
  from jsonb_array_elements(coalesce(p_participants, '[]'::jsonb)) as elem;

  insert into public.candidate_dates (plan_id, start_at, end_at, is_all_day, sort_order)
  select
    v_plan_id,
    (elem->>'start_at')::timestamptz,
    nullif(elem->>'end_at', '')::timestamptz,
    coalesce((elem->>'is_all_day')::boolean, false),
    coalesce((elem->>'sort_order')::integer, 0)
  from jsonb_array_elements(coalesce(p_candidate_dates, '[]'::jsonb)) as elem;

  insert into public.share_links (plan_id, token, purpose, expires_at)
  values (v_plan_id, p_share_token, 'answer', p_share_expires_at);

  insert into public.plan_reminder_settings (plan_id, reminder_offset_minutes, reminder_offsets_minutes)
  values (v_plan_id, p_reminder_offset_minutes, coalesce(p_reminder_offsets_minutes, '{}'::integer[]));

  return v_plan_id;
end;
$$;

revoke all on function public.create_plan_with_children(uuid, text, timestamptz, text, jsonb, jsonb, text, timestamptz, integer, integer[]) from public;
revoke all on function public.create_plan_with_children(uuid, text, timestamptz, text, jsonb, jsonb, text, timestamptz, integer, integer[]) from anon;
grant execute on function public.create_plan_with_children(uuid, text, timestamptz, text, jsonb, jsonb, text, timestamptz, integer, integer[]) to authenticated;
grant execute on function public.create_plan_with_children(uuid, text, timestamptz, text, jsonb, jsonb, text, timestamptz, integer, integer[]) to service_role;

-- ---------------------------------------------------------------------------
-- replace_plan_schedule（日程編集）
-- ---------------------------------------------------------------------------
create or replace function public.replace_plan_schedule(
  target_plan_id uuid,
  p_title text,
  p_answer_deadline_at timestamptz,
  p_memo text,
  p_candidate_dates jsonb,
  p_reminder_offset_minutes integer,
  p_reminder_offsets_minutes integer[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
  v_event_id uuid;
begin
  select owner_user_id, event_id
  into v_owner_user_id, v_event_id
  from public.plans
  where id = target_plan_id
  for update;

  if not found then
    raise exception '日程調整が見つかりません';
  end if;

  if auth.uid() is distinct from v_owner_user_id then
    raise exception '主催者だけが日程調整を編集できます';
  end if;

  update public.plans
  set title = p_title,
      answer_deadline_at = p_answer_deadline_at,
      memo = p_memo
  where id = target_plan_id;

  delete from public.availability_answers
  where candidate_date_id in (
    select id from public.candidate_dates where plan_id = target_plan_id
  );

  delete from public.candidate_dates where plan_id = target_plan_id;

  insert into public.candidate_dates (plan_id, start_at, end_at, is_all_day, sort_order)
  select
    target_plan_id,
    (elem->>'start_at')::timestamptz,
    nullif(elem->>'end_at', '')::timestamptz,
    coalesce((elem->>'is_all_day')::boolean, false),
    coalesce((elem->>'sort_order')::integer, 0)
  from jsonb_array_elements(coalesce(p_candidate_dates, '[]'::jsonb)) as elem;

  insert into public.plan_reminder_settings (plan_id, reminder_offset_minutes, reminder_offsets_minutes)
  values (target_plan_id, p_reminder_offset_minutes, coalesce(p_reminder_offsets_minutes, '{}'::integer[]))
  on conflict (plan_id) do update
  set reminder_offset_minutes = excluded.reminder_offset_minutes,
      reminder_offsets_minutes = excluded.reminder_offsets_minutes;

  return v_event_id;
end;
$$;

revoke all on function public.replace_plan_schedule(uuid, text, timestamptz, text, jsonb, integer, integer[]) from public;
revoke all on function public.replace_plan_schedule(uuid, text, timestamptz, text, jsonb, integer, integer[]) from anon;
grant execute on function public.replace_plan_schedule(uuid, text, timestamptz, text, jsonb, integer, integer[]) to authenticated;
grant execute on function public.replace_plan_schedule(uuid, text, timestamptz, text, jsonb, integer, integer[]) to service_role;
