-- 共有リンク配下（/s/）を service role から外し、参加者本人の権限で読み書きさせる。
--
-- これまで plans / participants / candidate_dates などのポリシーは主催者
-- （owner_user_id = auth.uid()）しか通していなかった。参加者はRLS越しに1行も読めないので、
-- /s/ 配下は service role でRLSを素通りするしかなく、認可はアプリのコードだけが支えていた。
-- アプリ側で入れた判断（参加者だけが読める・払う本人だけが記録できる・本人だけが
-- 受け取り先を書き換えられる）を、そのままDB側にも置く。コード側のチェックは残す。

-- ---------------------------------------------------------------------------
-- 判定用のヘルパー
--
-- participants のポリシーが participants を読むと、PostgreSQL がRLSの循環を検出して
-- 無限再帰で落ちる。015 で events × event_members が同じ罠を踏んでいるので、同じ手で
-- 判定を security definer 関数に閉じ込める。
-- ---------------------------------------------------------------------------

-- 自分がその日程調整の参加者か
create or replace function public.is_plan_participant(target_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants
    where participants.plan_id = target_plan_id
      and participants.user_id = auth.uid()
  );
$$;

-- 自分がそのイベントのどれかの日程調整の参加者か（イベント名・場所を出すため）
create or replace function public.is_participant_of_event(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants
    join public.plans on plans.id = participants.plan_id
    where plans.event_id = target_event_id
      and participants.user_id = auth.uid()
  );
$$;

-- その participants 行が自分自身か（書き換えてよいのは自分の行だけ）
create or replace function public.is_own_participant(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants
    where participants.id = target_participant_id
      and participants.user_id = auth.uid()
  );
$$;

-- その participants 行が、自分も参加している日程調整のものか
create or replace function public.is_participant_in_my_plan(target_participant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.participants as target
    join public.participants as mine on mine.plan_id = target.plan_id
    where target.id = target_participant_id
      and mine.user_id = auth.uid()
  );
$$;

-- その清算の「支払う側」が自分か
create or replace function public.is_settlement_payer(target_settlement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.settlements
    join public.participants on participants.id = settlements.from_participant_id
    where settlements.id = target_settlement_id
      and participants.user_id = auth.uid()
  );
$$;

-- その清算が、自分も参加している日程調整のものか
create or replace function public.is_settlement_in_my_plan(target_settlement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.settlements
    join public.participants on participants.plan_id = settlements.plan_id
    where settlements.id = target_settlement_id
      and participants.user_id = auth.uid()
  );
$$;

revoke all on function public.is_plan_participant(uuid) from public;
revoke all on function public.is_participant_of_event(uuid) from public;
revoke all on function public.is_own_participant(uuid) from public;
revoke all on function public.is_participant_in_my_plan(uuid) from public;
revoke all on function public.is_settlement_payer(uuid) from public;
revoke all on function public.is_settlement_in_my_plan(uuid) from public;

grant execute on function public.is_plan_participant(uuid) to authenticated;
grant execute on function public.is_participant_of_event(uuid) to authenticated;
grant execute on function public.is_own_participant(uuid) to authenticated;
grant execute on function public.is_participant_in_my_plan(uuid) to authenticated;
grant execute on function public.is_settlement_payer(uuid) to authenticated;
grant execute on function public.is_settlement_in_my_plan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 読み取り
--
-- 参加者でなければ1行も返さない。共有リンクを知っているだけの人には、
-- イベント名も候補日時も金額も渡らない。
-- ---------------------------------------------------------------------------

drop policy if exists "Participants can view their event" on public.events;
create policy "Participants can view their event"
on public.events
for select
to authenticated
using (public.is_participant_of_event(id));

drop policy if exists "Participants can view their plan" on public.plans;
create policy "Participants can view their plan"
on public.plans
for select
to authenticated
using (public.is_plan_participant(id));

-- 名前は参加者どうしで見える。誰の回答か・誰に払うのかが分からないと使えないため。
drop policy if exists "Participants can view co-participants" on public.participants;
create policy "Participants can view co-participants"
on public.participants
for select
to authenticated
using (public.is_plan_participant(plan_id));

drop policy if exists "Participants can view candidate dates" on public.candidate_dates;
create policy "Participants can view candidate dates"
on public.candidate_dates
for select
to authenticated
using (public.is_plan_participant(plan_id));

-- トークンを知っていても、参加者でなければ行が返らない。
-- 「トークンで探す → 参加者かどうかで見えるかが決まる」がそのままDB側の規則になる。
drop policy if exists "Participants can view their share link" on public.share_links;
create policy "Participants can view their share link"
on public.share_links
for select
to authenticated
using (public.is_plan_participant(plan_id));

drop policy if exists "Participants can view answers" on public.availability_answers;
create policy "Participants can view answers"
on public.availability_answers
for select
to authenticated
using (public.is_participant_in_my_plan(participant_id));

drop policy if exists "Participants can view expenses" on public.expenses;
create policy "Participants can view expenses"
on public.expenses
for select
to authenticated
using (public.is_plan_participant(plan_id));

drop policy if exists "Participants can view settlements" on public.settlements;
create policy "Participants can view settlements"
on public.settlements
for select
to authenticated
using (public.is_plan_participant(plan_id));

drop policy if exists "Participants can view settlement payments" on public.settlement_payments;
create policy "Participants can view settlement payments"
on public.settlement_payments
for select
to authenticated
using (public.is_settlement_in_my_plan(settlement_id));

-- ---------------------------------------------------------------------------
-- 書き込み
--
-- 書ける相手は必ず auth.uid() に固定する。読み取りより一段狭い。
-- ---------------------------------------------------------------------------

-- 日程回答。自分の participants 行に紐づくものだけ。
drop policy if exists "Participants can write their own answers" on public.availability_answers;
create policy "Participants can write their own answers"
on public.availability_answers
for insert
to authenticated
with check (public.is_own_participant(participant_id));

drop policy if exists "Participants can update their own answers" on public.availability_answers;
create policy "Participants can update their own answers"
on public.availability_answers
for update
to authenticated
using (public.is_own_participant(participant_id))
with check (public.is_own_participant(participant_id));

-- 受け取り先（PayPay等）と回答済みフラグ。他人の行を書き換えられると、
-- 攻撃者の口座へ振り込ませられる。自分の行だけに閉じる。
drop policy if exists "Participants can update their own row" on public.participants;
create policy "Participants can update their own row"
on public.participants
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- 支払いの記録。払ったのは from_participant なので、そこが自分の清算だけ。
drop policy if exists "Payers can record their settlement payment" on public.settlement_payments;
create policy "Payers can record their settlement payment"
on public.settlement_payments
for insert
to authenticated
with check (public.is_settlement_payer(settlement_id));

drop policy if exists "Payers can update their settlement" on public.settlements;
create policy "Payers can update their settlement"
on public.settlements
for update
to authenticated
using (public.is_settlement_payer(id))
with check (public.is_settlement_payer(id));

-- ---------------------------------------------------------------------------
-- plans.settlement_status だけは参加者にも動かさせる
--
-- 支払いを記録すると日程調整が「清算中」に変わる。ただし plans を参加者に update
-- させると他の列まで開いてしまい、RLSでは列を絞れない。関数1つに閉じ込める。
-- ---------------------------------------------------------------------------

create or replace function public.mark_plan_settling(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_plan_participant(target_plan_id) then
    raise exception 'この日程調整の参加者ではありません';
  end if;

  update public.plans
  set settlement_status = 'settling'
  where id = target_plan_id;
end;
$$;

revoke all on function public.mark_plan_settling(uuid) from public;
grant execute on function public.mark_plan_settling(uuid) to authenticated;
