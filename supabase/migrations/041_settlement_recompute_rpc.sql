create or replace function public.recompute_plan_settlements(target_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
  v_participant_ids uuid[];
  v_balances bigint[];
  v_participant_count integer;
  v_participant_index integer;
  v_expense record;
  v_split record;
  v_creditor_ids uuid[] := '{}'::uuid[];
  v_creditor_amounts bigint[] := '{}'::bigint[];
  v_debtor_ids uuid[] := '{}'::uuid[];
  v_debtor_amounts bigint[] := '{}'::bigint[];
  v_creditor_index integer := 1;
  v_debtor_index integer := 1;
  v_transfer_amount bigint;
  v_transfer_count integer := 0;
begin
  select plans.owner_user_id
  into v_owner_user_id
  from public.plans
  where plans.id = target_plan_id
  for update;

  if not found then
    raise exception 'plan not found';
  end if;

  if auth.uid() is distinct from v_owner_user_id then
    raise exception 'only the plan owner can recompute settlements';
  end if;

  select coalesce(
    array_agg(participants.id order by participants.display_name collate "C", participants.id),
    '{}'::uuid[]
  )
  into v_participant_ids
  from public.participants
  where participants.plan_id = target_plan_id;

  v_participant_count := cardinality(v_participant_ids);
  if v_participant_count > 0 then
    v_balances := array_fill(0::bigint, array[v_participant_count]);
  else
    v_balances := '{}'::bigint[];
  end if;

  for v_expense in
    select
      expenses.id,
      expenses.payer_participant_id,
      expenses.amount,
      count(expense_splits.id) as split_count,
      coalesce(sum(expense_splits.amount), 0)::bigint as split_total
    from public.expenses
    left join public.expense_splits on expense_splits.expense_id = expenses.id
    where expenses.plan_id = target_plan_id
    group by expenses.id, expenses.payer_participant_id, expenses.amount
    order by expenses.created_at, expenses.id
  loop
    v_participant_index := array_position(v_participant_ids, v_expense.payer_participant_id);
    if v_participant_index is null then
      raise exception 'participant does not belong to plan (expense payer: %)', v_expense.payer_participant_id;
    end if;

    if v_expense.split_count = 0 then
      raise exception 'expense % must have at least one split', v_expense.id;
    end if;

    if v_expense.split_total <> v_expense.amount then
      raise exception 'expense % split amounts must sum to expense amount', v_expense.id;
    end if;

    v_balances[v_participant_index] := v_balances[v_participant_index] + v_expense.amount;

    for v_split in
      select expense_splits.participant_id, expense_splits.amount
      from public.expense_splits
      where expense_splits.expense_id = v_expense.id
      order by expense_splits.created_at, expense_splits.id
    loop
      v_participant_index := array_position(v_participant_ids, v_split.participant_id);
      if v_participant_index is null then
        raise exception 'participant does not belong to plan (expense split: %)', v_split.participant_id;
      end if;

      v_balances[v_participant_index] := v_balances[v_participant_index] - v_split.amount;
    end loop;
  end loop;

  if v_participant_count > 0 then
    for v_participant_index in 1..v_participant_count loop
      if v_balances[v_participant_index] > 0 then
        v_creditor_ids := array_append(v_creditor_ids, v_participant_ids[v_participant_index]);
        v_creditor_amounts := array_append(v_creditor_amounts, v_balances[v_participant_index]);
      elsif v_balances[v_participant_index] < 0 then
        v_debtor_ids := array_append(v_debtor_ids, v_participant_ids[v_participant_index]);
        v_debtor_amounts := array_append(v_debtor_amounts, abs(v_balances[v_participant_index]));
      end if;
    end loop;
  end if;

  delete from public.settlements
  where settlements.plan_id = target_plan_id
    and settlements.status = 'unpaid';

  while v_creditor_index <= cardinality(v_creditor_ids)
    and v_debtor_index <= cardinality(v_debtor_ids)
  loop
    v_transfer_amount := least(
      v_creditor_amounts[v_creditor_index],
      v_debtor_amounts[v_debtor_index]
    );

    if v_transfer_amount > 0 then
      insert into public.settlements (
        plan_id,
        from_participant_id,
        to_participant_id,
        amount,
        status
      )
      values (
        target_plan_id,
        v_debtor_ids[v_debtor_index],
        v_creditor_ids[v_creditor_index],
        v_transfer_amount,
        'unpaid'
      );
      v_transfer_count := v_transfer_count + 1;
    end if;

    v_creditor_amounts[v_creditor_index] :=
      v_creditor_amounts[v_creditor_index] - v_transfer_amount;
    v_debtor_amounts[v_debtor_index] :=
      v_debtor_amounts[v_debtor_index] - v_transfer_amount;

    if v_creditor_amounts[v_creditor_index] = 0 then
      v_creditor_index := v_creditor_index + 1;
    end if;

    if v_debtor_amounts[v_debtor_index] = 0 then
      v_debtor_index := v_debtor_index + 1;
    end if;
  end loop;

  update public.plans
  set settlement_status = case when v_transfer_count > 0 then 'needed' else 'not_needed' end
  where plans.id = target_plan_id;
end;
$$;

revoke all on function public.recompute_plan_settlements(uuid) from public;
revoke all on function public.recompute_plan_settlements(uuid) from anon;
grant execute on function public.recompute_plan_settlements(uuid) to authenticated;
grant execute on function public.recompute_plan_settlements(uuid) to service_role;
