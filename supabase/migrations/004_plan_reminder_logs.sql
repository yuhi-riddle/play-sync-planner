create table public.plan_reminder_logs (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  recipient_names text[] not null default '{}',
  reminder_message text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index plan_reminder_logs_plan_id_idx on public.plan_reminder_logs(plan_id);
create index plan_reminder_logs_actor_user_id_idx on public.plan_reminder_logs(actor_user_id);

alter table public.plan_reminder_logs enable row level security;

create policy "Owners can manage plan reminder logs"
on public.plan_reminder_logs
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = plan_reminder_logs.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = plan_reminder_logs.plan_id
      and plans.owner_user_id = auth.uid()
  )
);
