create table public.settlement_payments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  paid_by_participant_id uuid references public.participants(id) on delete set null,
  amount integer not null,
  payment_method text,
  payment_url text,
  memo text,
  paid_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlement_payments_amount_check check (amount > 0)
);

create index settlement_payments_settlement_id_idx on public.settlement_payments(settlement_id);
create index settlement_payments_paid_by_participant_id_idx on public.settlement_payments(paid_by_participant_id);

create trigger settlement_payments_set_updated_at
before update on public.settlement_payments
for each row execute function public.set_updated_at();

alter table public.settlement_payments enable row level security;

create policy "Owners can manage settlement payments"
on public.settlement_payments
for all
to authenticated
using (
  exists (
    select 1
    from public.settlements
    join public.plans on plans.id = settlements.plan_id
    where settlements.id = settlement_payments.settlement_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.settlements
    join public.plans on plans.id = settlements.plan_id
    where settlements.id = settlement_payments.settlement_id
      and plans.owner_user_id = auth.uid()
  )
);
