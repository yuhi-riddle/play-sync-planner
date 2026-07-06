create table public.plan_reminder_settings (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  reminder_offset_minutes integer,
  reminder_offsets_minutes integer[] not null default '{}'::integer[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_reminder_settings_plan_id_unique unique (plan_id),
  constraint plan_reminder_settings_offset_check check (
    reminder_offset_minutes is null or reminder_offset_minutes >= 0
  ),
  constraint plan_reminder_settings_offsets_check check (
    reminder_offsets_minutes is not null
    and array_position(reminder_offsets_minutes, null) is null
    and 0 <= all (reminder_offsets_minutes)
  )
);

create index plan_reminder_settings_plan_id_idx on public.plan_reminder_settings(plan_id);

create trigger plan_reminder_settings_set_updated_at
before update on public.plan_reminder_settings
for each row execute function public.set_updated_at();

alter table public.plan_reminder_settings enable row level security;

create policy "Owners can manage plan reminder settings"
on public.plan_reminder_settings
for all
to authenticated
using (
  exists (
    select 1 from public.plans
    where plans.id = plan_reminder_settings.plan_id
      and plans.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.plans
    where plans.id = plan_reminder_settings.plan_id
      and plans.owner_user_id = auth.uid()
  )
);
