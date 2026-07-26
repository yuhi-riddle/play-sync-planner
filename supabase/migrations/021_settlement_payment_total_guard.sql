-- 支払い記録の二重送信・同時リクエストによる過払いを防ぐ。
-- settlements 行をロックしてから合計額を検証することで、アプリ側の
-- Read-Then-Write チェックだけでは防げないレースコンディションを塞ぐ。
create or replace function public.enforce_settlement_payment_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  settlement_amount integer;
  paid_total integer;
begin
  select amount into settlement_amount
  from public.settlements
  where id = new.settlement_id
  for update;

  if settlement_amount is null then
    raise exception 'settlement % not found', new.settlement_id;
  end if;

  select coalesce(sum(amount), 0) into paid_total
  from public.settlement_payments
  where settlement_id = new.settlement_id;

  if paid_total + new.amount > settlement_amount then
    raise exception 'settlement payment total (%) would exceed the settlement amount (%)', paid_total + new.amount, settlement_amount;
  end if;

  return new;
end;
$$;

create trigger settlement_payments_enforce_total
before insert on public.settlement_payments
for each row execute function public.enforce_settlement_payment_total();
