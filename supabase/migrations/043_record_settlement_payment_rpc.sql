-- 清算支払いの記録を 1 トランザクション・settlement 行ロック下で行う RPC。
--
-- これまで lib/actions/settlement/settlements.ts は
--   settlement_payments への insert → settlements の status/paid_at 更新 → plans.settlement_status 更新
-- を別々の DB 操作で実行していた。insert 成功後に後続 update が失敗すると、
-- 「支払いは記録されたが清算ステータスが古い」状態が残った。
--
-- 過払い（合計 > 請求額）のレースは migration 021 の
-- settlement_payments_enforce_total トリガーが settlement をロックして防いでいる。
-- この関数はそれに加えて status 遷移までを同一トランザクションに収める。
--
-- 呼び出し元は 2 つ:
--   - recordSettlementPaymentAction（主催者）
--   - recordPublicSettlementPaymentAction（共有リンク経由の支払い本人）
-- どちらの権限も関数内で判定する。共有リンクの有効性・レート制限は呼び出し側の責務。

create or replace function public.record_settlement_payment(
  target_settlement_id uuid,
  p_amount integer,
  p_payment_url text,
  p_memo text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_from_participant_id uuid;
  v_settlement_amount integer;
  v_owner_user_id uuid;
  v_paid_total bigint;
  v_confirmed_total bigint;
  v_payment_method text;
  v_payment_id uuid;
  v_next_status text;
begin
  select s.plan_id, s.from_participant_id, s.amount
  into v_plan_id, v_from_participant_id, v_settlement_amount
  from public.settlements s
  where s.id = target_settlement_id
  for update;

  if not found then
    raise exception '清算内容が見つかりません';
  end if;

  select owner_user_id into v_owner_user_id
  from public.plans
  where id = v_plan_id;

  -- 権限: 主催者、または「払う本人」（settlement.from_participant にひもづく参加者）
  if auth.uid() is distinct from v_owner_user_id
     and not exists (
       select 1 from public.participants
       where id = v_from_participant_id
         and plan_id = v_plan_id
         and user_id = auth.uid()
     )
  then
    raise exception '主催者または支払う本人だけが支払いを記録できます';
  end if;

  select
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (where confirmed_at is not null), 0)
  into v_paid_total, v_confirmed_total
  from public.settlement_payments
  where settlement_id = target_settlement_id;

  if v_paid_total + p_amount > v_settlement_amount then
    raise exception '支払い金額が残額を超えています';
  end if;

  select settlement_payment_method into v_payment_method
  from public.participants
  where id = v_from_participant_id;

  insert into public.settlement_payments (
    settlement_id, paid_by_participant_id, amount, payment_method, payment_url, memo
  )
  values (
    target_settlement_id, v_from_participant_id, p_amount, v_payment_method, p_payment_url, p_memo
  )
  returning id into v_payment_id;

  -- 挿入後の合計で status を決める（confirmed_at は今回分は null）
  v_paid_total := v_paid_total + p_amount;

  v_next_status := case
    when v_settlement_amount = 0 or v_confirmed_total = v_settlement_amount then 'confirmed'
    when v_paid_total = v_settlement_amount then 'paid'
    else 'unpaid'
  end;

  update public.settlements
  set
    status = v_next_status,
    paid_at = case when v_paid_total > 0 then now() else null end
  where id = target_settlement_id;

  update public.plans
  set settlement_status = 'settling'
  where id = v_plan_id;

  return v_payment_id;
end;
$$;

revoke all on function public.record_settlement_payment(uuid, integer, text, text) from public;
revoke all on function public.record_settlement_payment(uuid, integer, text, text) from anon;
grant execute on function public.record_settlement_payment(uuid, integer, text, text) to authenticated;
grant execute on function public.record_settlement_payment(uuid, integer, text, text) to service_role;
