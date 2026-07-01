create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  payer_participant_id uuid not null references public.participants(id) on delete restrict,
  title text not null,
  category text not null default 'other',
  amount integer not null,
  paid_at timestamptz not null default now(),
  memo text,
  payment_method text,
  payment_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_amount_check check (amount >= 0)
);

create table public.expense_splits (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  amount integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expense_splits_amount_check check (amount >= 0),
  constraint expense_splits_unique unique (expense_id, participant_id)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  from_participant_id uuid not null references public.participants(id) on delete cascade,
  to_participant_id uuid not null references public.participants(id) on delete cascade,
  amount integer not null,
  status text not null default 'unpaid',
  payment_method text,
  payment_url text,
  memo text,
  paid_at timestamptz,
  confirmed_at timestamptz,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settlements_amount_check check (amount >= 0),
  constraint settlements_status_check check (status in ('unpaid', 'paid', 'confirmed'))
);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  uploaded_by_participant_id uuid references public.participants(id) on delete set null,
  proof_type text not null default 'memo_url',
  proof_url text,
  memo text,
  payment_method text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_proofs_type_check check (proof_type in ('memo_url', 'image_url'))
);

create table public.settlement_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  recipient_names text[] not null default '{}',
  reminder_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index expenses_plan_id_idx on public.expenses(plan_id);
create index expenses_payer_participant_id_idx on public.expenses(payer_participant_id);
create index expense_splits_expense_id_idx on public.expense_splits(expense_id);
create index expense_splits_participant_id_idx on public.expense_splits(participant_id);
create index settlements_plan_id_idx on public.settlements(plan_id);
create index settlements_from_participant_id_idx on public.settlements(from_participant_id);
create index settlements_to_participant_id_idx on public.settlements(to_participant_id);
create index payment_proofs_settlement_id_idx on public.payment_proofs(settlement_id);
create index settlement_reminder_logs_plan_id_idx on public.settlement_reminder_logs(plan_id);
create index settlement_reminder_logs_actor_user_id_idx on public.settlement_reminder_logs(actor_user_id);

create trigger expenses_set_updated_at
before update on public.expenses
for each row execute function public.set_updated_at();

create trigger expense_splits_set_updated_at
before update on public.expense_splits
for each row execute function public.set_updated_at();

create trigger settlements_set_updated_at
before update on public.settlements
for each row execute function public.set_updated_at();

create trigger payment_proofs_set_updated_at
before update on public.payment_proofs
for each row execute function public.set_updated_at();

alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.settlement_reminder_logs enable row level security;

create policy "Owners can manage expenses"
on public.expenses
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = expenses.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = expenses.plan_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage expense splits"
on public.expense_splits
for all
to authenticated
using (
  exists (
    select 1
    from public.expenses
    join public.plans on plans.id = expenses.plan_id
    where expenses.id = expense_splits.expense_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.expenses
    join public.plans on plans.id = expenses.plan_id
    where expenses.id = expense_splits.expense_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage settlements"
on public.settlements
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = settlements.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = settlements.plan_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage payment proofs"
on public.payment_proofs
for all
to authenticated
using (
  exists (
    select 1
    from public.settlements
    join public.plans on plans.id = settlements.plan_id
    where settlements.id = payment_proofs.settlement_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.settlements
    join public.plans on plans.id = settlements.plan_id
    where settlements.id = payment_proofs.settlement_id
      and plans.owner_user_id = auth.uid()
  )
);

create policy "Owners can manage settlement reminder logs"
on public.settlement_reminder_logs
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = settlement_reminder_logs.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = settlement_reminder_logs.plan_id
      and plans.owner_user_id = auth.uid()
  )
);
