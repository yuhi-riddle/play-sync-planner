-- 立替（費用）の作成・編集・削除を、1 トランザクション・plan 行ロック下で行う RPC。
--
-- これまで lib/actions/settlement/settlements.ts は
--   expenses への insert/update → expense_splits の delete/insert → 精算の再計算
-- を別々の DB 操作で実行していた。途中で失敗すると「費用だけ保存されて分担・精算が古い」
-- 状態が残り、同時編集では後勝ちで精算がずれた。
--
-- ここで作る 3 関数は、いずれも冒頭で対象 plan を FOR UPDATE ロックし、
-- 検証 → 書き込み → public.recompute_plan_settlements(plan_id)（041）までを
-- ひとつの関数（＝ひとつのトランザクション）内で完了させる。

-- ---------------------------------------------------------------------------
-- 共通: 変更可否チェック（アプリ側 assertExpenseCanChange と同じ条件）
-- ---------------------------------------------------------------------------
create or replace function public.assert_plan_expenses_mutable(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.settlement_payments sp
    join public.settlements s on s.id = sp.settlement_id
    where s.plan_id = target_plan_id
  ) then
    raise exception '清算支払いが始まっているため、立替支払いは変更できません';
  end if;

  if exists (
    select 1
    from public.settlements
    where plan_id = target_plan_id
      and status in ('paid', 'confirmed')
  ) then
    raise exception '支払い済みの清算があるため、立替支払いは変更できません';
  end if;
end;
$$;

revoke all on function public.assert_plan_expenses_mutable(uuid) from public;
revoke all on function public.assert_plan_expenses_mutable(uuid) from anon;

-- ---------------------------------------------------------------------------
-- 共通: 分担の検証と書き込み
--   p_splits: [{"participant_id": "<uuid>", "amount": <int>}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.replace_expense_splits(
  target_expense_id uuid,
  target_plan_id uuid,
  p_amount integer,
  p_payer_participant_id uuid,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_split_total bigint;
  v_split_count integer;
  v_bad_participant uuid;
begin
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' then
    raise exception 'splits must be a JSON array';
  end if;

  select
    coalesce(sum((elem->>'amount')::bigint), 0),
    count(*)
  into v_split_total, v_split_count
  from jsonb_array_elements(p_splits) as elem;

  if v_split_count = 0 then
    raise exception 'expense must have at least one split';
  end if;

  if v_split_total <> p_amount then
    raise exception 'split amounts must sum to the expense amount';
  end if;

  -- payer と全 split participant が当該 plan の参加者であること
  if not exists (
    select 1 from public.participants
    where id = p_payer_participant_id and plan_id = target_plan_id
  ) then
    raise exception 'payer does not belong to this plan';
  end if;

  select (elem->>'participant_id')::uuid
  into v_bad_participant
  from jsonb_array_elements(p_splits) as elem
  where not exists (
    select 1 from public.participants
    where id = (elem->>'participant_id')::uuid and plan_id = target_plan_id
  )
  limit 1;

  if v_bad_participant is not null then
    raise exception 'split participant % does not belong to this plan', v_bad_participant;
  end if;

  delete from public.expense_splits where expense_id = target_expense_id;

  insert into public.expense_splits (expense_id, participant_id, amount)
  select
    target_expense_id,
    (elem->>'participant_id')::uuid,
    (elem->>'amount')::integer
  from jsonb_array_elements(p_splits) as elem;
end;
$$;

revoke all on function public.replace_expense_splits(uuid, uuid, integer, uuid, jsonb) from public;
revoke all on function public.replace_expense_splits(uuid, uuid, integer, uuid, jsonb) from anon;

-- ---------------------------------------------------------------------------
-- create_expense
-- ---------------------------------------------------------------------------
create or replace function public.create_expense(
  target_plan_id uuid,
  p_payer_participant_id uuid,
  p_title text,
  p_amount integer,
  p_memo text,
  p_payment_url text,
  p_is_important boolean,
  p_splits jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
  v_expense_id uuid;
begin
  select owner_user_id into v_owner_user_id
  from public.plans
  where id = target_plan_id
  for update;

  if not found then
    raise exception 'plan not found';
  end if;

  if auth.uid() is distinct from v_owner_user_id then
    raise exception '主催者だけが清算を編集できます';
  end if;

  perform public.assert_plan_expenses_mutable(target_plan_id);

  insert into public.expenses (
    plan_id, payer_participant_id, title, amount, memo, payment_url, is_important
  )
  values (
    target_plan_id, p_payer_participant_id, p_title, p_amount, p_memo, p_payment_url, coalesce(p_is_important, false)
  )
  returning id into v_expense_id;

  perform public.replace_expense_splits(v_expense_id, target_plan_id, p_amount, p_payer_participant_id, p_splits);
  perform public.recompute_plan_settlements(target_plan_id);

  return v_expense_id;
end;
$$;

revoke all on function public.create_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) from public;
revoke all on function public.create_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) from anon;
grant execute on function public.create_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) to authenticated;
grant execute on function public.create_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- update_expense
-- ---------------------------------------------------------------------------
create or replace function public.update_expense(
  target_expense_id uuid,
  p_payer_participant_id uuid,
  p_title text,
  p_amount integer,
  p_memo text,
  p_payment_url text,
  p_is_important boolean,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_owner_user_id uuid;
begin
  select e.plan_id into v_plan_id
  from public.expenses e
  where e.id = target_expense_id;

  if not found then
    raise exception 'expense not found';
  end if;

  select owner_user_id into v_owner_user_id
  from public.plans
  where id = v_plan_id
  for update;

  if auth.uid() is distinct from v_owner_user_id then
    raise exception '主催者だけが立替支払いを編集できます';
  end if;

  perform public.assert_plan_expenses_mutable(v_plan_id);

  update public.expenses
  set
    payer_participant_id = p_payer_participant_id,
    title = p_title,
    amount = p_amount,
    memo = p_memo,
    payment_url = p_payment_url,
    is_important = coalesce(p_is_important, false)
  where id = target_expense_id;

  perform public.replace_expense_splits(target_expense_id, v_plan_id, p_amount, p_payer_participant_id, p_splits);
  perform public.recompute_plan_settlements(v_plan_id);
end;
$$;

revoke all on function public.update_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) from public;
revoke all on function public.update_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) from anon;
grant execute on function public.update_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) to authenticated;
grant execute on function public.update_expense(uuid, uuid, text, integer, text, text, boolean, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- delete_expense
-- ---------------------------------------------------------------------------
create or replace function public.delete_expense(target_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_owner_user_id uuid;
begin
  select e.plan_id into v_plan_id
  from public.expenses e
  where e.id = target_expense_id;

  if not found then
    raise exception 'expense not found';
  end if;

  select owner_user_id into v_owner_user_id
  from public.plans
  where id = v_plan_id
  for update;

  if auth.uid() is distinct from v_owner_user_id then
    raise exception '主催者だけが立替支払いを削除できます';
  end if;

  perform public.assert_plan_expenses_mutable(v_plan_id);

  -- expense_splits は expenses への FK が on delete cascade。
  delete from public.expenses where id = target_expense_id;

  perform public.recompute_plan_settlements(v_plan_id);
end;
$$;

revoke all on function public.delete_expense(uuid) from public;
revoke all on function public.delete_expense(uuid) from anon;
grant execute on function public.delete_expense(uuid) to authenticated;
grant execute on function public.delete_expense(uuid) to service_role;
